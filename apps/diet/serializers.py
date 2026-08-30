from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import DietAssignment, DietItem, DietPlan, Meal

User = get_user_model()


class DietItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = DietItem
        fields = [
            "id", "food_name", "quantity", "calories",
            "protein_g", "carbs_g", "fat_g", "notes", "order",
        ]
        read_only_fields = ["id"]


class MealSerializer(serializers.ModelSerializer):
    """Used to create a meal slot (name/time/order) and to read it back
    with its food items nested (items are added via their own endpoint)."""

    items = DietItemSerializer(many=True, read_only=True)

    class Meta:
        model = Meal
        fields = ["id", "name", "time", "order", "items"]
        read_only_fields = ["id"]


class DietPlanListSerializer(serializers.ModelSerializer):
    """Lightweight — for the trainer/admin plan list view."""

    created_by = serializers.StringRelatedField(read_only=True)

    class Meta:
        model = DietPlan
        fields = ["id", "name", "goal", "created_by", "created_at"]


class DietPlanSerializer(serializers.ModelSerializer):
    """Full detail — all meals (and their items) nested in one response."""

    created_by = serializers.StringRelatedField(read_only=True)
    meals = MealSerializer(many=True, read_only=True)

    class Meta:
        model = DietPlan
        fields = [
            "id", "name", "description", "goal", "created_by",
            "meals", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_by", "created_at", "updated_at"]


class DietAssignmentSerializer(serializers.ModelSerializer):
    """Used both to assign a plan (POST {"user": <id>}) and to list a
    member's assigned diet plans in full detail via /api/my-diet-plans/."""

    user = serializers.PrimaryKeyRelatedField(queryset=User.objects.filter(role=User.Role.MEMBER))
    assigned_by = serializers.StringRelatedField(read_only=True)
    plan_detail = DietPlanSerializer(source="plan", read_only=True)

    class Meta:
        model = DietAssignment
        fields = ["id", "plan_detail", "user", "assigned_by", "status", "assigned_at"]
        read_only_fields = ["id", "assigned_by", "assigned_at", "plan_detail"]
