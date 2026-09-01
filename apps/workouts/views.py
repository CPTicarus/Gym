from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import generics, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.filters import SearchFilter
from rest_framework.generics import get_object_or_404
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsStaff, IsTrainerOrAdmin

from .models import (
    DailyExercise,
    WarmupExercise,
    WorkoutAssignment,
    WorkoutDay,
    WorkoutDayExercise,
    WorkoutPlan,
)
from .serializers import (
    DailyExerciseSerializer,
    WarmupExerciseSerializer,
    WorkoutAssignmentListSerializer,
    WorkoutAssignmentSerializer,
    WorkoutDayExerciseSerializer,
    WorkoutDaySerializer,
    WorkoutPlanListSerializer,
    WorkoutPlanSerializer,
)


class WorkoutPlanViewSet(viewsets.ModelViewSet):
    """
    Trainer/admin-only management of workout plans. Members never hit this
    directly — they read their own plans via /api/my-workout-plans/.

      GET/POST        /api/workout-plans/
      GET/PATCH/DELETE /api/workout-plans/{id}/
      POST             /api/workout-plans/{id}/assign/   {"user": <member_id>}
    """

    queryset = WorkoutPlan.objects.all().select_related("created_by").prefetch_related(
        "warmup_exercises__move", "days__exercises__move", "daily_exercises__move"
    )
    permission_classes = [IsTrainerOrAdmin]
    filter_backends = [DjangoFilterBackend, SearchFilter]
    filterset_fields = ["goal", "is_template"]
    search_fields = ["name", "description"]

    def get_serializer_class(self):
        return WorkoutPlanListSerializer if self.action == "list" else WorkoutPlanSerializer

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=["post"], url_path="assign")
    def assign(self, request, pk=None):
        plan = self.get_object()
        serializer = WorkoutAssignmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # A member has one active workout plan at a time (WorkoutAssignment.save
        # enforces this by auto-completing the rest) — captured here just so
        # the response can tell the caller a previous plan was archived.
        replaced = WorkoutAssignment.objects.filter(
            user=serializer.validated_data["user"], status=WorkoutAssignment.Status.ACTIVE
        ).select_related("plan").first()

        serializer.save(plan=plan, assigned_by=request.user)
        data = dict(serializer.data)
        data["previous_plan_archived"] = replaced.plan.name if replaced else None
        return Response(data, status=status.HTTP_201_CREATED)


# --- Section 1: warmup, nested under a plan ---
class WarmupExerciseViewSet(viewsets.ModelViewSet):
    serializer_class = WarmupExerciseSerializer
    permission_classes = [IsTrainerOrAdmin]

    def get_queryset(self):
        return WarmupExercise.objects.filter(plan_id=self.kwargs["plan_pk"]).select_related("move")

    def perform_create(self, serializer):
        plan = get_object_or_404(WorkoutPlan, pk=self.kwargs["plan_pk"])
        serializer.save(plan=plan)


# --- Section 2: days, and exercises nested under each day ---
class WorkoutDayViewSet(viewsets.ModelViewSet):
    serializer_class = WorkoutDaySerializer
    permission_classes = [IsTrainerOrAdmin]

    def get_queryset(self):
        return WorkoutDay.objects.filter(plan_id=self.kwargs["plan_pk"]).prefetch_related("exercises__move")

    def perform_create(self, serializer):
        plan = get_object_or_404(WorkoutPlan, pk=self.kwargs["plan_pk"])
        serializer.save(plan=plan)


class WorkoutDayExerciseViewSet(viewsets.ModelViewSet):
    serializer_class = WorkoutDayExerciseSerializer
    permission_classes = [IsTrainerOrAdmin]

    def get_queryset(self):
        # scoping by both plan_pk and day_pk means a mismatched URL 404s
        # instead of silently exposing another plan's day
        return WorkoutDayExercise.objects.filter(
            day_id=self.kwargs["day_pk"], day__plan_id=self.kwargs["plan_pk"]
        ).select_related("move")

    def perform_create(self, serializer):
        day = get_object_or_404(WorkoutDay, pk=self.kwargs["day_pk"], plan_id=self.kwargs["plan_pk"])
        serializer.save(day=day)


# --- Section 3: daily items, nested under a plan ---
class DailyExerciseViewSet(viewsets.ModelViewSet):
    serializer_class = DailyExerciseSerializer
    permission_classes = [IsTrainerOrAdmin]

    def get_queryset(self):
        return DailyExercise.objects.filter(plan_id=self.kwargs["plan_pk"]).select_related("move")

    def perform_create(self, serializer):
        plan = get_object_or_404(WorkoutPlan, pk=self.kwargs["plan_pk"])
        serializer.save(plan=plan)


class WorkoutAssignmentViewSet(viewsets.ModelViewSet):
    """
    Staff view of who has which plan — the other direction from the
    /my-workout-plans/ endpoint members use.

      GET    /api/workout-assignments/?plan=3     who has this plan
      GET    /api/workout-assignments/?user=12    what this member is doing
      GET    /api/workout-assignments/?status=active
      PATCH  /api/workout-assignments/{id}/       {"status": "paused"}
      DELETE /api/workout-assignments/{id}/       unassign

    Read is open to any staff role (accounting may want to see what a
    member is on); changing or removing an assignment is trainer/admin.
    """

    queryset = WorkoutAssignment.objects.all().select_related("plan", "user", "assigned_by")
    serializer_class = WorkoutAssignmentListSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["plan", "user", "status"]
    http_method_names = ["get", "patch", "delete", "head", "options"]

    def get_permissions(self):
        if self.request.method in ("PATCH", "DELETE"):
            return [IsTrainerOrAdmin()]
        return [IsStaff()]


class MyWorkoutPlansView(generics.ListAPIView):
    """A member's own assigned plans, full detail (warmup + days + daily).

      GET /api/my-workout-plans/
      GET /api/my-workout-plans/?status=active
    """

    serializer_class = WorkoutAssignmentSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["status"]

    def get_queryset(self):
        return WorkoutAssignment.objects.filter(user=self.request.user).select_related(
            "plan", "assigned_by"
        ).prefetch_related(
            "plan__warmup_exercises__move", "plan__days__exercises__move", "plan__daily_exercises__move"
        )


class FinishWorkoutDayView(APIView):
    """A member finishes today's gym session — advances which day the
    session view shows next time (wraps to the first day after the last).

      POST /api/my-workout-plans/{assignment_id}/finish-day/
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, assignment_pk):
        assignment = get_object_or_404(WorkoutAssignment, pk=assignment_pk, user=request.user)
        assignment.advance_day()
        return Response(WorkoutAssignmentSerializer(assignment).data)
