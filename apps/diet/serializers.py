from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import AllowedFood, DietAssignment, DietDay, DietItem, DietPlan, Food, Meal

User = get_user_model()


class FoodSerializer(serializers.ModelSerializer):
    """A library food with its per-serving nutrition. The same shape for
    the library, the builder's food picker and the copy nested inside
    every diet item, because all three need the numbers — the picker to
    preview "200 g = 330 kcal" as the trainer types, the plans to scale
    them."""

    class Meta:
        model = Food
        fields = ["id", "name", "alias", "category", "unit", "serving_size", *Food.NUTRIENT_FIELDS]
        read_only_fields = ["id"]

    def validate_unit(self, value):
        # A plan's amounts are in this unit: "200" is 200 g only while the
        # food is measured in grams. Switching a food that's already in
        # plans to pieces would quietly turn every one of those into 200
        # pieces — so it's refused, and a new food is the way to do it.
        if self.instance and value != self.instance.unit and self.instance.is_in_use():
            raise serializers.ValidationError(
                "This food is used in diet plans, so its unit can't be changed."
            )
        return value


class _FoodFieldsMixin(serializers.Serializer):
    """Shared by both entry serializers below: write with a food id, read
    back the whole food so its nutrition can be scaled to the amount.
    Same pattern as _MoveFieldsMixin in apps/workouts/serializers.py — and
    a Serializer subclass for the same reason (a plain mixin contributes
    no declared fields)."""

    food = serializers.PrimaryKeyRelatedField(queryset=Food.objects.all())
    food_detail = FoodSerializer(source="food", read_only=True)


class DietItemSerializer(_FoodFieldsMixin, serializers.ModelSerializer):
    class Meta:
        model = DietItem
        fields = ["id", "food", "food_detail", "amount", "notes", "order"]
        read_only_fields = ["id"]


class AllowedFoodSerializer(_FoodFieldsMixin, serializers.ModelSerializer):
    class Meta:
        model = AllowedFood
        fields = ["id", "food", "food_detail", "amount", "notes", "order"]
        read_only_fields = ["id"]

    def validate(self, attrs):
        # The (plan, food) constraint, checked here so a repeat comes back
        # as a 400 on `food` rather than an IntegrityError. The plan isn't
        # a field on this serializer (it comes from the URL), hence the
        # view kwargs.
        food = attrs.get("food", getattr(self.instance, "food", None))
        duplicates = AllowedFood.objects.filter(plan_id=self.context["view"].kwargs["plan_pk"], food=food)
        if self.instance is not None:
            duplicates = duplicates.exclude(pk=self.instance.pk)
        if duplicates.exists():
            raise serializers.ValidationError({"food": "This food is already on the list."})
        return attrs


class MealSerializer(serializers.ModelSerializer):
    """Used to create a meal slot (name/time/order) within a day and to
    read it back with its food items nested (items are added via their
    own endpoint)."""

    items = DietItemSerializer(many=True, read_only=True)

    class Meta:
        model = Meal
        fields = ["id", "name", "time", "order", "items"]
        read_only_fields = ["id"]


class DietDaySerializer(serializers.ModelSerializer):
    """One of the plan's 7 fixed days. Read-only — days are auto-created
    with the plan (see DietPlanViewSet.perform_create), never added or
    removed by a trainer; only the meals within a day change."""

    day_of_week_display = serializers.CharField(source="get_day_of_week_display", read_only=True)
    meals = MealSerializer(many=True, read_only=True)

    class Meta:
        model = DietDay
        fields = ["id", "day_of_week", "day_of_week_display", "meals"]
        read_only_fields = fields


class DietPlanListSerializer(serializers.ModelSerializer):
    """Lightweight — for the trainer/admin plan list view."""

    created_by = serializers.StringRelatedField(read_only=True)

    class Meta:
        model = DietPlan
        fields = ["id", "name", "goal", "kind", "created_by", "created_at"]


class DietPlanSerializer(serializers.ModelSerializer):
    """Full detail in one response: a weekly plan's 7 days (with their
    meals and items), or an allowed-foods plan's list. Each kind's other
    list simply comes back empty."""

    created_by = serializers.StringRelatedField(read_only=True)
    days = DietDaySerializer(many=True, read_only=True)
    allowed_foods = AllowedFoodSerializer(many=True, read_only=True)

    class Meta:
        model = DietPlan
        fields = [
            "id", "name", "description", "goal", "kind", "created_by",
            "days", "allowed_foods", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_by", "created_at", "updated_at"]

    def validate_kind(self, value):
        # Chosen once, at creation (see DietPlan's docstring) — the two
        # kinds hold different data, so there's nothing to convert.
        if self.instance is not None and value != self.instance.kind:
            raise serializers.ValidationError("A plan's kind is fixed when it's created.")
        return value


class DietAssignmentListSerializer(serializers.ModelSerializer):
    """Staff-facing, flat counterpart to the member's nested view — same
    reasoning as WorkoutAssignmentListSerializer."""

    plan_name = serializers.CharField(source="plan.name", read_only=True)
    user_full_name = serializers.SerializerMethodField()
    user_username = serializers.CharField(source="user.username", read_only=True)
    assigned_by = serializers.StringRelatedField(read_only=True)

    class Meta:
        model = DietAssignment
        fields = [
            "id", "plan", "plan_name", "user", "user_full_name", "user_username",
            "assigned_by", "status", "assigned_at",
        ]
        read_only_fields = ["id", "plan", "user", "assigned_by", "assigned_at"]

    def get_user_full_name(self, obj):
        return obj.user.get_full_name() or obj.user.username


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
