from django.contrib.auth import get_user_model
from rest_framework import serializers

from apps.moves.models import Move
from apps.moves.serializers import MoveListSerializer

from .models import (
    DailyExercise,
    WarmupExercise,
    WorkoutAssignment,
    WorkoutDay,
    WorkoutDayExercise,
    WorkoutPlan,
)

User = get_user_model()


class _MoveFieldsMixin:
    """Shared by every exercise-item serializer below: write with a move id,
    read back a lightweight nested move (name/category/difficulty)."""

    move_detail = MoveListSerializer(source="move", read_only=True)
    move = serializers.PrimaryKeyRelatedField(queryset=Move.objects.all())


class WarmupExerciseSerializer(_MoveFieldsMixin, serializers.ModelSerializer):
    class Meta:
        model = WarmupExercise
        fields = ["id", "move", "move_detail", "sets", "reps", "duration_seconds", "order", "notes"]
        read_only_fields = ["id"]


class WorkoutDayExerciseSerializer(_MoveFieldsMixin, serializers.ModelSerializer):
    class Meta:
        model = WorkoutDayExercise
        fields = [
            "id", "move", "move_detail", "sets", "reps",
            "duration_seconds", "rest_seconds", "order", "notes",
        ]
        read_only_fields = ["id"]


class DailyExerciseSerializer(_MoveFieldsMixin, serializers.ModelSerializer):
    class Meta:
        model = DailyExercise
        fields = ["id", "move", "move_detail", "sets", "reps", "duration_seconds", "order", "notes"]
        read_only_fields = ["id"]


class WorkoutDaySerializer(serializers.ModelSerializer):
    """Used both to create a day (name + order) and to read it back with
    its exercises nested (exercises are added via their own endpoint)."""

    exercises = WorkoutDayExerciseSerializer(many=True, read_only=True)

    class Meta:
        model = WorkoutDay
        fields = ["id", "name", "order", "exercises"]
        read_only_fields = ["id"]


class WorkoutPlanListSerializer(serializers.ModelSerializer):
    """Lightweight — for the trainer/admin plan list view."""

    created_by = serializers.StringRelatedField(read_only=True)

    class Meta:
        model = WorkoutPlan
        fields = ["id", "name", "goal", "is_template", "created_by", "created_at"]


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
            "id", "name", "description", "goal", "is_template", "created_by",
            "warmup_exercises", "days", "daily_exercises",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_by", "created_at", "updated_at"]


class WorkoutAssignmentSerializer(serializers.ModelSerializer):
    """Used both to assign a plan (POST {"user": <id>}) and to list a
    member's assigned plans in full detail via /api/my-workout-plans/."""

    user = serializers.PrimaryKeyRelatedField(queryset=User.objects.filter(role=User.Role.MEMBER))
    assigned_by = serializers.StringRelatedField(read_only=True)
    plan_detail = WorkoutPlanSerializer(source="plan", read_only=True)

    class Meta:
        model = WorkoutAssignment
        fields = ["id", "plan_detail", "user", "assigned_by", "status", "assigned_at"]
        read_only_fields = ["id", "assigned_by", "assigned_at", "plan_detail"]
