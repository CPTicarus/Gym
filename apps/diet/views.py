from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import generics, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.filters import SearchFilter
from rest_framework.generics import get_object_or_404
from rest_framework.response import Response

from apps.accounts.permissions import IsStaff, IsTrainerOrAdmin

from .models import DietAssignment, DietItem, DietPlan, Meal
from .serializers import (
    DietAssignmentListSerializer,
    DietAssignmentSerializer,
    DietItemSerializer,
    DietPlanListSerializer,
    DietPlanSerializer,
    MealSerializer,
)


class DietPlanViewSet(viewsets.ModelViewSet):
    """
    Trainer/admin-only management of diet plans. Members never hit this
    directly — they read their own plans via /api/my-diet-plans/.

      GET/POST         /api/diet-plans/
      GET/PATCH/DELETE /api/diet-plans/{id}/
      POST             /api/diet-plans/{id}/assign/   {"user": <member_id>}
    """

    # Most plans use these three, so every new plan starts with them
    # pre-filled — trainers building the common case skip straight to
    # adding food items, and just delete/rename/add to what doesn't fit.
    DEFAULT_MEALS = [
        ("صبحانه", "08:00", 0),
        ("ناهار", "13:00", 1),
        ("شام", "20:00", 2),
    ]

    queryset = DietPlan.objects.all().select_related("created_by").prefetch_related("meals__items")
    permission_classes = [IsTrainerOrAdmin]
    filter_backends = [DjangoFilterBackend, SearchFilter]
    filterset_fields = ["goal"]
    search_fields = ["name", "description"]

    def get_serializer_class(self):
        return DietPlanListSerializer if self.action == "list" else DietPlanSerializer

    def perform_create(self, serializer):
        plan = serializer.save(created_by=self.request.user)
        Meal.objects.bulk_create(
            Meal(plan=plan, name=name, time=time, order=order) for name, time, order in self.DEFAULT_MEALS
        )

    @action(detail=True, methods=["post"], url_path="assign")
    def assign(self, request, pk=None):
        plan = self.get_object()
        serializer = DietAssignmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(plan=plan, assigned_by=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class MealViewSet(viewsets.ModelViewSet):
    """Meal slots nested under a plan: /api/diet-plans/{plan_pk}/meals/"""

    serializer_class = MealSerializer
    permission_classes = [IsTrainerOrAdmin]

    def get_queryset(self):
        return Meal.objects.filter(plan_id=self.kwargs["plan_pk"]).prefetch_related("items")

    def perform_create(self, serializer):
        plan = get_object_or_404(DietPlan, pk=self.kwargs["plan_pk"])
        serializer.save(plan=plan)


class DietItemViewSet(viewsets.ModelViewSet):
    """Food items nested under a meal: /api/diet-plans/{plan_pk}/meals/{meal_pk}/items/"""

    serializer_class = DietItemSerializer
    permission_classes = [IsTrainerOrAdmin]

    def get_queryset(self):
        # scoping by both plan_pk and meal_pk means a mismatched URL 404s
        # instead of silently exposing another plan's meal
        return DietItem.objects.filter(meal_id=self.kwargs["meal_pk"], meal__plan_id=self.kwargs["plan_pk"])

    def perform_create(self, serializer):
        meal = get_object_or_404(Meal, pk=self.kwargs["meal_pk"], plan_id=self.kwargs["plan_pk"])
        serializer.save(meal=meal)


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
        ).prefetch_related("plan__meals__items")
