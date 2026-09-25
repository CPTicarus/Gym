from django.db import transaction
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import generics, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.filters import SearchFilter
from rest_framework.generics import get_object_or_404
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsStaff, IsTrainerOrAdmin
from apps.plan_copy import copy_name

from .models import (
    DailyExercise,
    Superset,
    WarmupExercise,
    WorkoutAssignment,
    WorkoutDay,
    WorkoutDayExercise,
    WorkoutPlan,
    WorkoutSession,
)
from .serializers import (
    DailyExerciseSerializer,
    FinishWorkoutDaySerializer,
    SupersetSerializer,
    WarmupExerciseSerializer,
    WorkoutAssignmentListSerializer,
    WorkoutAssignmentSerializer,
    WorkoutDayExerciseSerializer,
    WorkoutDaySerializer,
    WorkoutPlanListSerializer,
    WorkoutPlanSerializer,
    WorkoutSessionSerializer,
)


class WorkoutPlanViewSet(viewsets.ModelViewSet):
    """
    Trainer/admin-only management of workout plans. Members never hit this
    directly — they read their own plans via /api/my-workout-plans/.

      GET/POST         /api/workout-plans/
      GET/PATCH/DELETE /api/workout-plans/{id}/
      POST             /api/workout-plans/{id}/assign/      {"user": <member_id>}
      POST             /api/workout-plans/{id}/duplicate/   {"name": "..."} (optional)
    """

    queryset = WorkoutPlan.objects.all().select_related("created_by").prefetch_related(
        "warmup_exercises__move", "days__exercises__move", "days__supersets", "daily_exercises__move"
    )
    permission_classes = [IsTrainerOrAdmin]
    filter_backends = [DjangoFilterBackend, SearchFilter]
    filterset_fields = ["goal", "is_template"]
    search_fields = ["name", "description"]

    def get_serializer_class(self):
        return WorkoutPlanListSerializer if self.action == "list" else WorkoutPlanSerializer

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=["post"], url_path="duplicate")
    def duplicate(self, request, pk=None):
        """Copy a plan whole — warmup, every training day with its
        exercises and supersets, and the daily items.

        This is the "same programme, one thing different" case: a member
        turns up with a bad knee and needs the existing plan minus the
        squats, and rebuilding twelve exercises to change one is how
        trainers end up not bothering.

        What is NOT copied is the assignments. A duplicate exists to be
        varied before anyone gets it, so handing the original's members an
        untouched clone would defeat the point — and would quietly give
        two active plans to people who didn't ask for one. `created_by`
        becomes whoever pressed the button.

        Wrapped in a transaction: a plan copied down to "half its days" is
        worse than no copy, because nothing about it looks wrong.
        """
        source = self.get_object()
        with transaction.atomic():
            copy = WorkoutPlan.objects.create(
                name=copy_name(source.name, request.data.get("name")),
                description=source.description,
                goal=source.goal,
                is_template=source.is_template,
                min_bmi=source.min_bmi,
                max_bmi=source.max_bmi,
                created_by=request.user,
            )
            WarmupExercise.objects.bulk_create(
                WarmupExercise(
                    plan=copy,
                    move_id=exercise.move_id,
                    sets=exercise.sets,
                    reps=exercise.reps,
                    duration_seconds=exercise.duration_seconds,
                    order=exercise.order,
                    notes=exercise.notes,
                )
                for exercise in source.warmup_exercises.all()
            )
            for day in source.days.all():
                day_copy = WorkoutDay.objects.create(plan=copy, name=day.name, order=day.order)
                # Each superset copied first, so the copied moves can point
                # at their own day's copy rather than back at the source's.
                superset_copies = {
                    superset.id: Superset.objects.create(
                        day=day_copy,
                        name=superset.name,
                        sets=superset.sets,
                        rest_seconds=superset.rest_seconds,
                        notes=superset.notes,
                    )
                    for superset in day.supersets.all()
                }
                WorkoutDayExercise.objects.bulk_create(
                    WorkoutDayExercise(
                        day=day_copy,
                        superset=superset_copies.get(exercise.superset_id),
                        move_id=exercise.move_id,
                        sets=exercise.sets,
                        reps=exercise.reps,
                        duration_seconds=exercise.duration_seconds,
                        rest_seconds=exercise.rest_seconds,
                        order=exercise.order,
                        notes=exercise.notes,
                    )
                    for exercise in day.exercises.all()
                )
            DailyExercise.objects.bulk_create(
                DailyExercise(
                    plan=copy,
                    move_id=exercise.move_id,
                    sets=exercise.sets,
                    reps=exercise.reps,
                    duration_seconds=exercise.duration_seconds,
                    order=exercise.order,
                    notes=exercise.notes,
                )
                for exercise in source.daily_exercises.all()
            )
        serializer = WorkoutPlanSerializer(copy, context=self.get_serializer_context())
        return Response(serializer.data, status=status.HTTP_201_CREATED)

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
        data["bmi_warning"] = self._bmi_warning(plan, serializer.validated_data["user"])
        return Response(data, status=status.HTTP_201_CREATED)

    @staticmethod
    def _bmi_warning(plan, member):
        """Advisory only (see WorkoutPlan.min_bmi/max_bmi) — the trainer can
        still assign the plan; this just flags it in the response (as data,
        not display text — the frontend renders it, same as
        `previous_plan_archived` above) instead of silently doing nothing."""
        if plan.min_bmi is None and plan.max_bmi is None:
            return None
        bmi = member.bmi
        if bmi is None:
            return {"reason": "missing_data"}
        if plan.min_bmi is not None and bmi < plan.min_bmi:
            return {"reason": "below_range", "bmi": bmi, "min_bmi": plan.min_bmi}
        if plan.max_bmi is not None and bmi > plan.max_bmi:
            return {"reason": "above_range", "bmi": bmi, "max_bmi": plan.max_bmi}
        return None


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
        return WorkoutDay.objects.filter(plan_id=self.kwargs["plan_pk"]).prefetch_related(
            "exercises__move", "supersets"
        )

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

    def perform_destroy(self, instance):
        # Taking a move out of a superset can leave it with only one, which
        # is no superset at all — see Superset.dissolve_if_alone.
        superset = instance.superset
        with transaction.atomic():
            instance.delete()
            if superset is not None:
                superset.dissolve_if_alone()


class SupersetViewSet(viewsets.ModelViewSet):
    """Supersets within a training day:

      GET/POST         /api/workout-plans/{plan_pk}/days/{day_pk}/supersets/
      GET/PATCH/DELETE /api/workout-plans/{plan_pk}/days/{day_pk}/supersets/{id}/

    POST takes the round and its moves together —
    {"sets": 4, "rest_seconds": 90, "exercises": [{"move": 1, "reps": 10}, ...]}
    — at least two moves. PATCH edits the round only; the moves are the
    day's exercises, edited (or added, with "superset": <id>) there.
    DELETE takes the superset's moves with it.
    """

    serializer_class = SupersetSerializer
    permission_classes = [IsTrainerOrAdmin]

    def get_queryset(self):
        # scoping by both plan_pk and day_pk means a mismatched URL 404s
        # instead of silently exposing another plan's day
        return Superset.objects.filter(day_id=self.kwargs["day_pk"], day__plan_id=self.kwargs["plan_pk"])

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
            "plan__warmup_exercises__move",
            "plan__days__exercises__move",
            "plan__days__supersets",
            "plan__daily_exercises__move",
        )


class FinishWorkoutDayView(APIView):
    """A member finishes today's gym session — advances which day the
    session view shows next time (wraps to the first day after the last).

      POST /api/my-workout-plans/{assignment_id}/finish-day/
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, assignment_pk):
        assignment = get_object_or_404(WorkoutAssignment, pk=assignment_pk, user=request.user)

        payload = FinishWorkoutDaySerializer(data=request.data or {})
        payload.is_valid(raise_exception=True)
        stats = payload.validated_data

        # The day that was just WORKED, captured before advance_day() moves
        # the pointer past it -- the response's active_day is the next one.
        finished_day = assignment.active_day()

        # One transaction: a logged session whose day never advanced (or an
        # advanced day with no session behind it) would quietly corrupt both
        # the streak and where the member picks up next time.
        with transaction.atomic():
            session = WorkoutSession.objects.create(
                user=request.user,
                assignment=assignment,
                day=finished_day,
                # Snapshots -- see WorkoutSession's docstring on why these
                # are copied rather than followed through the FKs.
                plan_name=assignment.plan.name,
                day_name=finished_day.name if finished_day else "",
                **stats,
            )
            assignment.advance_day()

        return Response(
            {
                **WorkoutAssignmentSerializer(assignment).data,
                "session": WorkoutSessionSerializer(session).data,
            }
        )


class MyWorkoutSessionsView(APIView):
    """A member's own finished sessions, for the streak and month count.

      GET /api/my-workout-sessions/

    Deliberately not a paginated ListAPIView: a streak is only correct if
    you can see every week back to the one that breaks it, and the global
    PAGE_SIZE of 20 would cut that off after a month and a half. It returns
    a flat, capped list instead.

    The bucketing into "this month" and "N weeks in a row" is left to the
    client. Those are Jalali-calendar, Saturday-first-week questions, and
    front/src/utils/jalali.js is deliberately the single place in this
    system that knows about the Persian calendar -- teaching the API a
    second answer would give us two that could disagree.
    """

    permission_classes = [permissions.IsAuthenticated]

    # ~15 months at three sessions a week: past the point where anyone's
    # streak is still unbroken, and small enough to send in one response.
    RECENT_LIMIT = 200

    def get(self, request):
        sessions = WorkoutSession.objects.filter(user=request.user)
        return Response(
            {
                "count": sessions.count(),
                "results": WorkoutSessionSerializer(
                    sessions[: self.RECENT_LIMIT], many=True
                ).data,
            }
        )
