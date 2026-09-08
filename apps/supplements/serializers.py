from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import SupplementAssignment, SupplementItem, SupplementPlan

User = get_user_model()


class SupplementItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = SupplementItem
        fields = ["id", "name", "dosage", "timing", "frequency", "notes", "order"]
        read_only_fields = ["id"]


class SupplementPlanListSerializer(serializers.ModelSerializer):
    """Lightweight — for the trainer/admin protocol list."""

    created_by = serializers.StringRelatedField(read_only=True)
    item_count = serializers.IntegerField(source="items.count", read_only=True)

    class Meta:
        model = SupplementPlan
        fields = ["id", "name", "goal", "created_by", "item_count", "created_at"]


class SupplementPlanSerializer(serializers.ModelSerializer):
    """Full detail — every item nested in one response."""

    created_by = serializers.StringRelatedField(read_only=True)
    items = SupplementItemSerializer(many=True, read_only=True)

    class Meta:
        model = SupplementPlan
        fields = [
            "id", "name", "description", "goal", "created_by",
            "items", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_by", "created_at", "updated_at"]


class SupplementAssignmentListSerializer(serializers.ModelSerializer):
    """Staff-facing, flat counterpart to the member's nested view — same
    reasoning as WorkoutAssignmentListSerializer."""

    plan_name = serializers.CharField(source="plan.name", read_only=True)
    user_full_name = serializers.SerializerMethodField()
    user_username = serializers.CharField(source="user.username", read_only=True)
    assigned_by = serializers.StringRelatedField(read_only=True)

    class Meta:
        model = SupplementAssignment
        fields = [
            "id", "plan", "plan_name", "user", "user_full_name", "user_username",
            "assigned_by", "status", "assigned_at",
        ]
        read_only_fields = ["id", "plan", "user", "assigned_by", "assigned_at"]

    def get_user_full_name(self, obj):
        return obj.user.get_full_name() or obj.user.username


class SupplementAssignmentSerializer(serializers.ModelSerializer):
    """Used both to assign a protocol (POST {"user": <id>}) and to list a
    member's own via /api/my-supplement-plans/."""

    user = serializers.PrimaryKeyRelatedField(queryset=User.objects.filter(role=User.Role.MEMBER))
    assigned_by = serializers.StringRelatedField(read_only=True)
    plan_detail = SupplementPlanSerializer(source="plan", read_only=True)

    class Meta:
        model = SupplementAssignment
        fields = ["id", "plan_detail", "user", "assigned_by", "status", "assigned_at"]
        read_only_fields = ["id", "assigned_by", "assigned_at", "plan_detail"]
