from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from apps.moves.models import Move


class _RepsOrDurationMixin:
    """A move is measured one way or the other — counted reps, or held for
    a duration (e.g. a plank) — never both at once."""

    def clean(self):
        if self.reps is not None and self.duration_seconds is not None:
            raise ValidationError("Provide either reps or a duration, not both.")


class WorkoutPlan(models.Model):
    """A named plan (e.g. 'Beginner Push/Pull/Legs') built from 3 sections:
    warmup, days (however many the split needs), and daily items that
    repeat every day regardless of which day it is (e.g. planks).

    A plan can be built as a reusable `is_template` and then handed to
    multiple members via WorkoutAssignment, or built one-off for a single
    person — the model doesn't force either way.
    """

    class Goal(models.TextChoices):
        MUSCLE_GAIN = "muscle_gain", "Muscle Gain"
        FAT_LOSS = "fat_loss", "Fat Loss"
        ENDURANCE = "endurance", "Endurance"
        STRENGTH = "strength", "Strength"
        GENERAL_FITNESS = "general_fitness", "General Fitness"
        OTHER = "other", "Other"

    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    goal = models.CharField(max_length=30, choices=Goal.choices, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="workout_plans_created",
        on_delete=models.SET_NULL,
        null=True,
    )
    is_template = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.name


class WorkoutAssignment(models.Model):
    """Who currently has this plan, and its lifecycle for that person.
    Kept separate from WorkoutPlan so one plan/template can be handed to
    many members, each tracked independently."""

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        PAUSED = "paused", "Paused"
        COMPLETED = "completed", "Completed"

    plan = models.ForeignKey(WorkoutPlan, related_name="assignments", on_delete=models.CASCADE)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="workout_assignments", on_delete=models.CASCADE
    )
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="+", on_delete=models.SET_NULL, null=True
    )
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)
    # Which split day is "up next" in the gym-session flow (warmup -> current_day
    # -> daily items). Advances when the member finishes a session; wraps back
    # to the first day after the last. Null means "not set yet" (no days on the
    # plan when assigned) — the API falls back to the plan's first day.
    current_day = models.ForeignKey(
        "WorkoutDay", related_name="+", on_delete=models.SET_NULL, null=True, blank=True
    )
    assigned_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-assigned_at"]

    def __str__(self):
        return f"{self.plan.name} -> {self.user} ({self.status})"

    def active_day(self):
        """The day to show right now: current_day if it still belongs to
        this plan, else the plan's first day, else None (no days at all)."""
        days = list(self.plan.days.all())
        if not days:
            return None
        if self.current_day_id and any(d.id == self.current_day_id for d in days):
            return self.current_day
        return days[0]

    def advance_day(self):
        """Move current_day to the next day in order, wrapping to the first
        after the last. No-op (returns None) if the plan has no days."""
        days = list(self.plan.days.all())
        if not days:
            return None
        active = self.active_day()
        idx = next(i for i, d in enumerate(days) if d.id == active.id)
        next_day = days[(idx + 1) % len(days)]
        self.current_day = next_day
        self.save(update_fields=["current_day"])
        return next_day


class WarmupExercise(_RepsOrDurationMixin, models.Model):
    """Section 1: warmup — a flat, ordered list of moves for this plan."""

    plan = models.ForeignKey(WorkoutPlan, related_name="warmup_exercises", on_delete=models.CASCADE)
    move = models.ForeignKey(Move, on_delete=models.PROTECT, related_name="+")
    sets = models.PositiveIntegerField(null=True, blank=True)
    reps = models.PositiveIntegerField(null=True, blank=True)
    duration_seconds = models.PositiveIntegerField(null=True, blank=True)  # e.g. "jog 60s" instead of reps
    order = models.PositiveIntegerField(default=0)
    notes = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return f"{self.plan.name} warmup: {self.move.name}"


class WorkoutDay(models.Model):
    """Section 2: one day within the split (a plan can have 2, 3, or more)."""

    plan = models.ForeignKey(WorkoutPlan, related_name="days", on_delete=models.CASCADE)
    name = models.CharField(max_length=50)  # "Day 1", "Push Day", "Legs"...
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return f"{self.plan.name} - {self.name}"


class WorkoutDayExercise(_RepsOrDurationMixin, models.Model):
    """A single move within a specific day, with its own sets/reps/rest."""

    day = models.ForeignKey(WorkoutDay, related_name="exercises", on_delete=models.CASCADE)
    move = models.ForeignKey(Move, on_delete=models.PROTECT, related_name="+")
    sets = models.PositiveIntegerField(null=True, blank=True)
    reps = models.PositiveIntegerField(null=True, blank=True)
    duration_seconds = models.PositiveIntegerField(null=True, blank=True)
    rest_seconds = models.PositiveIntegerField(null=True, blank=True)
    order = models.PositiveIntegerField(default=0)
    notes = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return f"{self.day}: {self.move.name}"


class DailyExercise(_RepsOrDurationMixin, models.Model):
    """Section 3: things done every day regardless of the day split
    (e.g. planks). Attached straight to the plan, not to any one day."""

    plan = models.ForeignKey(WorkoutPlan, related_name="daily_exercises", on_delete=models.CASCADE)
    move = models.ForeignKey(Move, on_delete=models.PROTECT, related_name="+")
    sets = models.PositiveIntegerField(null=True, blank=True)
    reps = models.PositiveIntegerField(null=True, blank=True)
    duration_seconds = models.PositiveIntegerField(null=True, blank=True)
    order = models.PositiveIntegerField(default=0)
    notes = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return f"{self.plan.name} daily: {self.move.name}"
