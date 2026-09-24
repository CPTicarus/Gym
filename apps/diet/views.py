from django.db import transaction
from django.db.models import ProtectedError
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import generics, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.filters import SearchFilter
from rest_framework.generics import get_object_or_404
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response

from apps.accounts.permissions import IsStaff, IsTrainerOrAdmin
from apps.moves.permissions import IsTrainerOrAdminOrReadOnly
from apps.plan_copy import copy_name

from .models import AllowedFood, DietAssignment, DietDay, DietItem, DietPlan, Food, Meal
from .serializers import (
    AllowedFoodSerializer,
    DietAssignmentListSerializer,
    DietAssignmentSerializer,
    DietItemSerializer,
    DietPlanListSerializer,
    DietPlanSerializer,
    FoodSerializer,
    MealSerializer,
)

# Everything a plan response nests, in one place — the builder and the
# member's page both read the same tree, and missing a level here is a
# query per food.
PLAN_PREFETCH = ["days__meals__items__food", "allowed_foods__food"]


class FoodPagination(PageNumberPagination):
    """The builder's food picker filters the whole library in the browser
    (like the move picker), so it asks for everything at once with
    ?page_size= rather than walking 20-row pages a request at a time."""

    page_size_query_param = "page_size"
    max_page_size = 1000


class FoodViewSet(viewsets.ModelViewSet):
    """
    The food library — what each food is, per serving. Diet plans point at
    these and say only how much.

      GET    /api/foods/            any authenticated user
      POST   /api/foods/            trainer/admin
      GET    /api/foods/{id}/       any authenticated user
      PATCH  /api/foods/{id}/       trainer/admin
      DELETE /api/foods/{id}/       trainer/admin — 409 while a plan uses it

    Filter/search:
      ?category=protein
      ?search=مرغ
      ?page_size=1000
    """

    queryset = Food.objects.all()
    serializer_class = FoodSerializer
    permission_classes = [IsTrainerOrAdminOrReadOnly]
    pagination_class = FoodPagination
    filter_backends = [DjangoFilterBackend, SearchFilter]
    filterset_fields = ["category"]
    search_fields = ["name", "alias"]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def destroy(self, request, *args, **kwargs):
        """Refused while any plan uses the food (the foreign keys PROTECT
        it) — and the refusal names those plans, since "in use" alone
        leaves the trainer hunting for where."""
        food = self.get_object()
        try:
            food.delete()
        except ProtectedError:
            return Response(
                {
                    "detail": "This food is used in diet plans and can't be deleted.",
                    "plans": food.plan_names(),
                },
                status=status.HTTP_409_CONFLICT,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class DietPlanViewSet(viewsets.ModelViewSet):
    """
    Trainer/admin-only management of diet plans. Members never hit this
    directly — they read their own plans via /api/my-diet-plans/.

      GET/POST         /api/diet-plans/
      GET/PATCH/DELETE /api/diet-plans/{id}/
      POST             /api/diet-plans/{id}/assign/      {"user": <member_id>}
      POST             /api/diet-plans/{id}/duplicate/   {"name": "..."} (optional)
    """

    # Most days use these three, so every new weekly plan starts with them
    # pre-filled on all 7 days — trainers building the common case skip
    # straight to adding food items, and just delete/rename/add to
    # whichever days/meals don't fit.
    DEFAULT_MEALS = [
        ("صبحانه", "08:00", 0),
        ("ناهار", "13:00", 1),
        ("شام", "20:00", 2),
    ]

    queryset = DietPlan.objects.all().select_related("created_by").prefetch_related(*PLAN_PREFETCH)
    permission_classes = [IsTrainerOrAdmin]
    filter_backends = [DjangoFilterBackend, SearchFilter]
    filterset_fields = ["goal", "kind"]
    search_fields = ["name", "description"]

    def get_serializer_class(self):
        return DietPlanListSerializer if self.action == "list" else DietPlanSerializer

    def perform_create(self, serializer):
        plan = serializer.save(created_by=self.request.user)
        # An allowed-foods plan has no days at all — it starts as an empty
        # list, which is the blank sheet a trainer picks it for.
        if plan.kind != DietPlan.Kind.WEEKLY:
            return
        days = DietDay.objects.bulk_create(
            DietDay(plan=plan, day_of_week=value) for value, _ in DietDay.Weekday.choices
        )
        Meal.objects.bulk_create(
            Meal(day=day, name=name, time=time, order=order)
            for day in days
            for name, time, order in self.DEFAULT_MEALS
        )

    @action(detail=True, methods=["post"], url_path="duplicate")
    def duplicate(self, request, pk=None):
        """Copy a plan whole: a weekly plan's seven days with their meals
        and every item, or an allowed-foods plan's list.

        Note this bypasses perform_create's default-meal scaffolding on
        purpose: a copy takes the SOURCE's days and meals, and seeding it
        with the standard breakfast/lunch/dinner first would leave the
        duplicate with both.

        Assignments aren't copied — a duplicate exists to be varied before
        anyone gets it. Atomic, so a half-copied plan can't be left behind
        looking complete.
        """
        source = self.get_object()
        with transaction.atomic():
            copy = DietPlan.objects.create(
                name=copy_name(source.name, request.data.get("name")),
                description=source.description,
                goal=source.goal,
                kind=source.kind,
                created_by=request.user,
            )
            for day in source.days.all():
                day_copy = DietDay.objects.create(plan=copy, day_of_week=day.day_of_week)
                for meal in day.meals.all():
                    meal_copy = Meal.objects.create(
                        day=day_copy, name=meal.name, time=meal.time, order=meal.order
                    )
                    DietItem.objects.bulk_create(
                        DietItem(
                            meal=meal_copy,
                            food_id=item.food_id,
                            amount=item.amount,
                            notes=item.notes,
                            order=item.order,
                        )
                        for item in meal.items.all()
                    )
            AllowedFood.objects.bulk_create(
                AllowedFood(
                    plan=copy,
                    food_id=entry.food_id,
                    amount=entry.amount,
                    notes=entry.notes,
                    order=entry.order,
                )
                for entry in source.allowed_foods.all()
            )
        serializer = DietPlanSerializer(copy, context=self.get_serializer_context())
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="assign")
    def assign(self, request, pk=None):
        plan = self.get_object()
        serializer = DietAssignmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # A member has one active diet plan at a time (DietAssignment.save
        # enforces this by auto-completing the rest) — captured here just so
        # the response can tell the caller a previous plan was archived.
        replaced = DietAssignment.objects.filter(
            user=serializer.validated_data["user"], status=DietAssignment.Status.ACTIVE
        ).select_related("plan").first()

        serializer.save(plan=plan, assigned_by=request.user)
        data = dict(serializer.data)
        data["previous_plan_archived"] = replaced.plan.name if replaced else None
        return Response(data, status=status.HTTP_201_CREATED)


class MealViewSet(viewsets.ModelViewSet):
    """Meal slots nested under a specific day of a plan:
    /api/diet-plans/{plan_pk}/days/{day_pk}/meals/"""

    serializer_class = MealSerializer
    permission_classes = [IsTrainerOrAdmin]

    def get_queryset(self):
        # scoping by both plan_pk and day_pk means a mismatched URL 404s
        # instead of silently exposing another plan's day
        return Meal.objects.filter(
            day_id=self.kwargs["day_pk"], day__plan_id=self.kwargs["plan_pk"]
        ).prefetch_related("items__food")

    def perform_create(self, serializer):
        day = get_object_or_404(DietDay, pk=self.kwargs["day_pk"], plan_id=self.kwargs["plan_pk"])
        serializer.save(day=day)


class DietItemViewSet(viewsets.ModelViewSet):
    """Food items nested under a meal: /api/diet-plans/{plan_pk}/meals/{meal_pk}/items/"""

    serializer_class = DietItemSerializer
    permission_classes = [IsTrainerOrAdmin]

    def get_queryset(self):
        # scoping by both plan_pk and meal_pk means a mismatched URL 404s
        # instead of silently exposing another plan's meal
        return DietItem.objects.filter(
            meal_id=self.kwargs["meal_pk"], meal__day__plan_id=self.kwargs["plan_pk"]
        ).select_related("food")

    def perform_create(self, serializer):
        meal = get_object_or_404(Meal, pk=self.kwargs["meal_pk"], day__plan_id=self.kwargs["plan_pk"])
        serializer.save(meal=meal)


class AllowedFoodViewSet(viewsets.ModelViewSet):
    """The list on an allowed-foods plan:
    /api/diet-plans/{plan_pk}/allowed-foods/"""

    serializer_class = AllowedFoodSerializer
    permission_classes = [IsTrainerOrAdmin]

    def get_queryset(self):
        return AllowedFood.objects.filter(plan_id=self.kwargs["plan_pk"]).select_related("food")

    def perform_create(self, serializer):
        plan = get_object_or_404(DietPlan, pk=self.kwargs["plan_pk"])
        # A weekly plan says what to eat meal by meal; a list of allowed
        # foods on top of that would be a second, contradicting answer.
        if plan.kind != DietPlan.Kind.ALLOWED:
            raise ValidationError({"detail": "Only an allowed-foods plan has an allowed-foods list."})
        serializer.save(plan=plan)


class DietAssignmentViewSet(viewsets.ModelViewSet):
    """Staff view of who has which diet plan — mirrors
    WorkoutAssignmentViewSet.

      GET    /api/diet-assignments/?plan=3
      GET    /api/diet-assignments/?user=12
      PATCH  /api/diet-assignments/{id}/   {"status": "completed"}
      DELETE /api/diet-assignments/{id}/   unassign
    """

    queryset = DietAssignment.objects.all().select_related("plan", "user", "assigned_by")
    serializer_class = DietAssignmentListSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["plan", "user", "status"]
    http_method_names = ["get", "patch", "delete", "head", "options"]

    def get_permissions(self):
        if self.request.method in ("PATCH", "DELETE"):
            return [IsTrainerOrAdmin()]
        return [IsStaff()]


class MyDietPlansView(generics.ListAPIView):
    """A member's own assigned diet plans, full detail (meals + items).

      GET /api/my-diet-plans/
      GET /api/my-diet-plans/?status=active
    """

    serializer_class = DietAssignmentSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["status"]

    def get_queryset(self):
        return DietAssignment.objects.filter(user=self.request.user).select_related(
            "plan", "assigned_by"
        ).prefetch_related(*(f"plan__{path}" for path in PLAN_PREFETCH))
