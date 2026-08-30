from django.conf import settings
from django.db import models


class DietPlan(models.Model):
    """An optional plan trainers/admins can give a member alongside (or
    instead of) a workout plan. Same assignment pattern as workouts: build
    the plan once, then hand it to whichever members need it."""

    class Goal(models.TextChoices):
        WEIGHT_LOSS = "weight_loss", "Weight Loss"
        MUSCLE_GAIN = "muscle_gain", "Muscle Gain"
        MAINTENANCE = "maintenance", "Maintenance"
        GENERAL_HEALTH = "general_health", "General Health"
        OTHER = "other", "Other"

    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    goal = models.CharField(max_length=30, choices=Goal.choices, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="diet_plans_created",
        on_delete=models.SET_NULL,
        null=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.name


class DietAssignment(models.Model):
    """Who currently has this diet plan, mirroring WorkoutAssignment so the
    two features behave the same way from a frontend's perspective."""

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        PAUSED = "paused", "Paused"
        COMPLETED = "completed", "Completed"

    plan = models.ForeignKey(DietPlan, related_name="assignments", on_delete=models.CASCADE)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="diet_assignments", on_delete=models.CASCADE
    )
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="+", on_delete=models.SET_NULL, null=True
    )
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)
    assigned_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-assigned_at"]

    def __str__(self):
        return f"{self.plan.name} -> {self.user} ({self.status})"


class Meal(models.Model):
    """One meal slot within a plan (Breakfast, Lunch, pre-workout snack...).
    Free-text name rather than fixed choices — trainers name meals however
    fits the member's schedule."""

    plan = models.ForeignKey(DietPlan, related_name="meals", on_delete=models.CASCADE)
    name = models.CharField(max_length=50)
    time = models.TimeField(null=True, blank=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return f"{self.plan.name} - {self.name}"


class DietItem(models.Model):
    """One food entry within a meal. Macros are optional — a trainer can
    just say 'grilled chicken breast, 150g' without going full macro-tracker."""

    meal = models.ForeignKey(Meal, related_name="items", on_delete=models.CASCADE)
    food_name = models.CharField(max_length=100)
    quantity = models.CharField(max_length=50, blank=True)  # "150g", "1 cup", "2 pieces"...
    calories = models.PositiveIntegerField(null=True, blank=True)
    protein_g = models.FloatField(null=True, blank=True)
    carbs_g = models.FloatField(null=True, blank=True)
    fat_g = models.FloatField(null=True, blank=True)
    notes = models.CharField(max_length=255, blank=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return f"{self.meal}: {self.food_name}"
