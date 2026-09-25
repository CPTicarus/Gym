from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Max
from rest_framework import serializers

from apps.moves.models import Move
from apps.moves.serializers import MoveListSerializer

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

User = get_user_model()


class _MoveFieldsMixin(serializers.Serializer):
    """Shared by every exercise-item serializer below: write with a move id,
    read back a lightweight nested move (name/category/difficulty).

    Must subclass Serializer (not just `object`) — DRF's metaclass only
    pulls declared fields from bases that carry their own `_declared_fields`
    (i.e. bases that went through SerializerMetaclass themselves), so a
    plain mixin class silently contributes no fields at all.
    """

    move_detail = MoveListSerializer(source="move", read_only=True)
    move = serializers.PrimaryKeyRelatedField(queryset=Move.objects.all())


class _RepsOrDurationValidationMixin:
    """A move is measured one way or the other — counted reps, or held for
    a duration (e.g. a plank) — never both. Mirrors MoveMediaSerializer's
    file-vs-external_url pattern: falls back to the existing instance's
    values on a PATCH so a partial update can't sneak past this."""

    def validate(self, attrs):
        reps = attrs.get("reps", getattr(self.instance, "reps", None))
        duration = attrs.get("duration_seconds", getattr(self.instance, "duration_seconds", None))
        if reps is not None and duration is not None:
            raise serializers.ValidationError("Provide either reps or a duration, not both.")
        return attrs


class WarmupExerciseSerializer(_MoveFieldsMixin, _RepsOrDurationValidationMixin, serializers.ModelSerializer):
    class Meta:
        model = WarmupExercise
        fields = ["id", "move", "move_detail", "sets", "reps", "duration_seconds", "order", "notes"]
        read_only_fields = ["id"]


class WorkoutDayExerciseSerializer(_MoveFieldsMixin, _RepsOrDurationValidationMixin, serializers.ModelSerializer):
    """A day's move. `superset` is the id of the superset it's done in, or
    null for a move done on its own; it can be given when a move is ADDED to
    an existing superset, but not changed afterwards — moving a move in or
    out of a superset changes what its sets mean, so that's a delete and a
    re-add rather than a quiet edit."""

    superset = serializers.PrimaryKeyRelatedField(
        queryset=Superset.objects.all(), required=False, allow_null=True
    )

    class Meta:
        model = WorkoutDayExercise
        fields = [
            "id", "move", "move_detail", "superset", "sets", "reps",
            "duration_seconds", "rest_seconds", "order", "notes",
        ]
        read_only_fields = ["id"]

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if self.instance is not None:
            if "superset" in attrs and attrs["superset"] != self.instance.superset:
                raise serializers.ValidationError(
                    {"superset": "A move can't be moved into or out of a superset once added."}
                )
            superset = self.instance.superset
        else:
            superset = attrs.get("superset")
            if superset is not None and superset.day_id != self.context["view"].kwargs["day_pk"]:
                raise serializers.ValidationError({"superset": "That superset belongs to another day."})
        sets = attrs.get("sets", getattr(self.instance, "sets", None))
        if superset is not None and sets is not None:
            raise serializers.ValidationError(
                {"sets": "A move in a superset takes its sets from the superset."}
            )
        return attrs


class SupersetMoveSerializer(_RepsOrDurationValidationMixin, serializers.ModelSerializer):
    """One move as it's written when a superset is created: which move, and
    how many reps (or seconds) of it per round. The round's sets and rest
    are the superset's, not the move's."""

    move = serializers.PrimaryKeyRelatedField(queryset=Move.objects.all())

    class Meta:
        model = WorkoutDayExercise
        fields = ["move", "reps", "duration_seconds", "notes"]


class SupersetSerializer(serializers.ModelSerializer):
    """Reads back as the round — name, sets, rest after each round. Its
    moves aren't repeated here: they're in the day's `exercises`, each
    pointing at this superset, which keeps one list of every move in the day.

    Created WITH its moves, in one request, so a superset of fewer than two
    never exists even between requests. Afterwards the round is edited here
    and each move through the day's exercises endpoint, like any move.
    """

    exercises = SupersetMoveSerializer(many=True, write_only=True, required=False)

    class Meta:
        model = Superset
        fields = ["id", "name", "sets", "rest_seconds", "notes", "exercises"]
        read_only_fields = ["id"]

    def validate(self, attrs):
        moves = attrs.get("exercises")
        if self.instance is None:
            if not moves or len(moves) < 2:
                raise serializers.ValidationError({"exercises": "A superset needs at least two moves."})
        elif moves is not None:
            raise serializers.ValidationError(
                {"exercises": "Edit a superset's moves through the day's exercises endpoint."}
            )
        return attrs

    def create(self, validated_data):
        moves = validated_data.pop("exercises")
        day = validated_data["day"]
        with transaction.atomic():
            superset = Superset.objects.create(**validated_data)
            # Appended after whatever the day already has, in the order given.
            last = day.exercises.aggregate(last=Max("order"))["last"]
            start = 0 if last is None else last + 1
            WorkoutDayExercise.objects.bulk_create(
                WorkoutDayExercise(day=day, superset=superset, order=start + index, **move)
                for index, move in enumerate(moves)
            )
        return superset


class DailyExerciseSerializer(_MoveFieldsMixin, _RepsOrDurationValidationMixin, serializers.ModelSerializer):
    class Meta:
        model = DailyExercise
        fields = ["id", "move", "move_detail", "sets", "reps", "duration_seconds", "order", "notes"]
        read_only_fields = ["id"]


class WorkoutDaySerializer(serializers.ModelSerializer):
    """Used both to create a day (name + order) and to read it back with
    its exercises nested (exercises are added via their own endpoint).

    `exercises` is every move of the day in order, superset moves included;
    `supersets` holds each superset's round (sets, rest) for the moves that
    point at it. A client groups them back together — see dayBlocks() in
    front/src/utils/supersets.js."""

    exercises = WorkoutDayExerciseSerializer(many=True, read_only=True)
    supersets = SupersetSerializer(many=True, read_only=True)

    class Meta:
        model = WorkoutDay
        fields = ["id", "name", "order", "exercises", "supersets"]
        read_only_fields = ["id"]


class WorkoutPlanListSerializer(serializers.ModelSerializer):
    """Lightweight — for the trainer/admin plan list view."""

    created_by = serializers.StringRelatedField(read_only=True)

    class Meta:
        model = WorkoutPlan
        fields = ["id", "name", "goal", "is_template", "min_bmi", "max_bmi", "created_by", "created_at"]


class WorkoutPlanSerializer(serializers.ModelSerializer):
    """Full detail — all 3 sections nested in one response, which is what
    both the plan-builder UI and a member's plan-detail screen want."""

    created_by = serializers.StringRelatedField(read_only=True)
    warmup_exercises = WarmupExerciseSerializer(many=True, read_only=True)
    days = WorkoutDaySerializer(many=True, read_only=True)
    daily_exercises = DailyExerciseSerializer(many=True, read_only=True)

    class Meta:
        model = WorkoutPlan
        fields = [
            "id", "name", "description", "goal", "is_template", "min_bmi", "max_bmi", "created_by",
            "warmup_exercises", "days", "daily_exercises",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_by", "created_at", "updated_at"]

    def validate(self, attrs):
        min_bmi = attrs.get("min_bmi", getattr(self.instance, "min_bmi", None))
        max_bmi = attrs.get("max_bmi", getattr(self.instance, "max_bmi", None))
        if min_bmi is not None and max_bmi is not None and min_bmi > max_bmi:
            raise serializers.ValidationError({"max_bmi": "max_bmi cannot be less than min_bmi."})
        return attrs


class WorkoutAssignmentListSerializer(serializers.ModelSerializer):
    """Staff-facing view of an assignment — light on purpose. The full
    nested plan (warmup/days/daily) is only needed on the member's own
    screen; here we just want to know who has what, so this stays flat
    enough to list dozens of rows without a heavy payload."""

    plan_name = serializers.CharField(source="plan.name", read_only=True)
    user_full_name = serializers.SerializerMethodField()
    user_username = serializers.CharField(source="user.username", read_only=True)
    assigned_by = serializers.StringRelatedField(read_only=True)

    class Meta:
        model = WorkoutAssignment
        fields = [
            "id", "plan", "plan_name", "user", "user_full_name", "user_username",
            "assigned_by", "status", "assigned_at",
        ]
        read_only_fields = ["id", "plan", "user", "assigned_by", "assigned_at"]

    def get_user_full_name(self, obj):
        return obj.user.get_full_name() or obj.user.username


class WorkoutAssignmentSerializer(serializers.ModelSerializer):
    """Used both to assign a plan (POST {"user": <id>}) and to list a
    member's assigned plans in full detail via /api/my-workout-plans/."""

    user = serializers.PrimaryKeyRelatedField(queryset=User.objects.filter(role=User.Role.MEMBER))
    assigned_by = serializers.StringRelatedField(read_only=True)
    plan_detail = WorkoutPlanSerializer(source="plan", read_only=True)
    # Which day the gym-session view should show right now — resolved
    # server-side (see WorkoutAssignment.active_day) so the frontend never
    # has to guess at "current_day is null" or "current_day got deleted".
    active_day = serializers.SerializerMethodField()

    class Meta:
        model = WorkoutAssignment
        fields = ["id", "plan_detail", "user", "assigned_by", "status", "active_day", "assigned_at"]
        read_only_fields = ["id", "assigned_by", "assigned_at", "plan_detail", "active_day"]

    def get_active_day(self, obj):
        day = obj.active_day()
        return WorkoutDaySerializer(day).data if day else None


class WorkoutSessionSerializer(serializers.ModelSerializer):
    """Read-only history row. `completed_at` goes out as a full ISO
    datetime, not a date, on purpose: TIME_ZONE is UTC, so a session
    finished at 1am Tehran carries the previous day's UTC date and only
    the instant is unambiguous. The frontend converts it to the member's
    local day -- and to a Jalali month -- exactly as it does everywhere
    else (see front/src/utils/jalali.js on why that boundary is there)."""

    class Meta:
        model = WorkoutSession
        fields = [
            "id", "plan_name", "day_name", "completed_at", "duration_seconds",
            "moves_done", "moves_total", "total_sets", "total_reps",
        ]
        read_only_fields = fields


class FinishWorkoutDaySerializer(serializers.Serializer):
    """The optional body of POST .../finish-day/.

    Every field defaults, so a client that posts nothing still finishes the
    day and simply logs a session with zeroes rather than failing -- the
    endpoint predates this payload and shouldn't start rejecting callers.

    These numbers are counted on the client (it's the only thing that knows
    which boxes got ticked), so they're bounded here rather than trusted.
    The two bounds behave differently on purpose:

    Duration is CLAMPED, not rejected. Leaving the tab open overnight and
    finishing in the morning is an ordinary thing a real member does, and
    refusing the request would mean their workout doesn't get logged at all
    over a number that's merely implausible. Six hours is recorded instead.

    The counts are REJECTED, because there is no real session with 5,000
    moves in it -- that's a broken or hostile client, and silently writing
    a clamped version of nonsense is worse than turning it away.
    """

    duration_seconds = serializers.IntegerField(required=False, default=0, min_value=0)
    moves_done = serializers.IntegerField(required=False, default=0, min_value=0, max_value=1000)
    moves_total = serializers.IntegerField(required=False, default=0, min_value=0, max_value=1000)
    total_sets = serializers.IntegerField(required=False, default=0, min_value=0, max_value=10000)
    total_reps = serializers.IntegerField(required=False, default=0, min_value=0, max_value=100000)

    def validate(self, attrs):
        if attrs["moves_done"] > attrs["moves_total"]:
            raise serializers.ValidationError(
                {"moves_done": "Cannot be greater than moves_total."}
            )
        attrs["duration_seconds"] = min(
            attrs["duration_seconds"], WorkoutSession.MAX_DURATION_SECONDS
        )
        return attrs
