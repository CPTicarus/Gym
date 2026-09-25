from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
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
    # Advisory safe range for this plan, in BMI rather than raw weight —
    # BMI accounts for height, which matters since a template plan gets
    # assigned to many members of different heights. Checked (as a warning,
    # not a hard block — see WorkoutPlanViewSet.assign) when a trainer/admin
    # assigns the plan to a member.
    min_bmi = models.FloatField(null=True, blank=True)
    max_bmi = models.FloatField(null=True, blank=True)
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

    def save(self, *args, **kwargs):
        # A member has at most one active workout plan at a time — anything
        # else is history (paused/completed). Enforced here rather than
        # only in the assign view so it also covers reactivating an old
        # assignment (PATCH status back to "active") through any path.
        if self.status == self.Status.ACTIVE:
            WorkoutAssignment.objects.filter(user_id=self.user_id, status=self.Status.ACTIVE).exclude(
                pk=self.pk
            ).update(status=self.Status.COMPLETED)
        super().save(*args, **kwargs)

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


class Superset(models.Model):
    """Two or more moves of a training day done back to back as one round —
    bench press, straight into curls, straight into front raises — with the
    round repeated `sets` times and the rest taken after each round rather
    than after each move.

    The moves stay WorkoutDayExercise rows (pointing here through
    `superset`), each with its own reps or duration, so everything that
    walks a day's exercises — the session checklist, its totals, copying a
    plan — still sees every move. What this adds is the grouping and the two
    numbers that belong to the round rather than to any one move: how many
    rounds, and the rest between them. A move in a superset therefore has no
    `sets` of its own.

    A superset never holds a single move — that's just a move — so it's
    created with at least two (SupersetSerializer) and taking away its
    second-to-last one turns what's left back into an ordinary exercise
    (dissolve_if_alone).
    """

    day = models.ForeignKey(WorkoutDay, related_name="supersets", on_delete=models.CASCADE)
    name = models.CharField(max_length=50, blank=True)  # "سوپرست سینه"
    sets = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    rest_seconds = models.PositiveIntegerField(null=True, blank=True)  # after each round
    notes = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return f"{self.day}: superset {self.name or self.pk}"

    def dissolve_if_alone(self):
        """Run after a move leaves. With one move left this isn't a superset
        any more, just that move — so it becomes an ordinary exercise again,
        taking the round's sets and rest as its own rather than losing
        them. With none left, the superset simply goes."""
        remaining = list(self.exercises.all()[:2])
        if len(remaining) > 1:
            return
        if remaining:
            move = remaining[0]
            move.superset = None
            move.sets = self.sets
            if self.rest_seconds is not None:
                move.rest_seconds = self.rest_seconds
            move.save(update_fields=["superset", "sets", "rest_seconds"])
        self.delete()


class WorkoutDayExercise(_RepsOrDurationMixin, models.Model):
    """A single move within a specific day, with its own sets/reps/rest —
    or, inside a superset, its own reps/duration only (see Superset)."""

    day = models.ForeignKey(WorkoutDay, related_name="exercises", on_delete=models.CASCADE)
    move = models.ForeignKey(Move, on_delete=models.PROTECT, related_name="+")
    # Set for a move done as part of a superset. Its sets then come from the
    # superset, and `rest_seconds` would mean rest after this move within a
    # round — normally none, which is the point of a superset.
    superset = models.ForeignKey(
        Superset, related_name="exercises", on_delete=models.CASCADE, null=True, blank=True
    )
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

    def clean(self):
        super().clean()
        if self.superset_id is not None:
            if self.superset.day_id != self.day_id:
                raise ValidationError("A superset's moves belong to the superset's own day.")
            if self.sets is not None:
                raise ValidationError("A move in a superset takes its sets from the superset.")


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


class WorkoutSession(models.Model):
    """One finished gym session, written when a member ends their workout.

    This exists so "how many sessions this month" and "how many weeks in a
    row" can be answered at all. Finishing a day used to do nothing but
    move the assignment's current_day pointer: that records that a session
    happened, but not when, for how long, or how much of it actually got
    done -- and the pointer is overwritten by the next session, so even
    that much is gone a day later.

    Almost everything here is a snapshot rather than a live lookup, because
    this is history and history must not be rewritten underneath the
    member. A trainer renaming "Push Day", swapping someone onto a new
    plan, or deleting a finished assignment should not change or erase what
    that person did in March -- so the foreign keys are nullable with
    SET_NULL, the names are copied in at finish time, and the totals are
    stored rather than recomputed from a plan that has since moved on.
    """

    # A tab left open overnight would otherwise log a 14-hour "workout" and
    # poison every average built on this table. Sessions are clamped to
    # this on the way in (see FinishWorkoutDayView).
    MAX_DURATION_SECONDS = 6 * 60 * 60

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="workout_sessions", on_delete=models.CASCADE
    )
    assignment = models.ForeignKey(
        WorkoutAssignment, related_name="sessions", on_delete=models.SET_NULL, null=True, blank=True
    )
    day = models.ForeignKey(
        "WorkoutDay", related_name="+", on_delete=models.SET_NULL, null=True, blank=True
    )
    plan_name = models.CharField(max_length=100, blank=True)
    day_name = models.CharField(max_length=50, blank=True)

    completed_at = models.DateTimeField(auto_now_add=True)
    duration_seconds = models.PositiveIntegerField(default=0)
    moves_done = models.PositiveIntegerField(default=0)
    moves_total = models.PositiveIntegerField(default=0)
    total_sets = models.PositiveIntegerField(default=0)
    total_reps = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["-completed_at"]
        # Every read of this table is "this member's sessions, newest
        # first" -- the streak/count endpoint and nothing else.
        indexes = [models.Index(fields=["user", "-completed_at"])]

    def __str__(self):
        return f"{self.user} - {self.day_name or 'session'} @ {self.completed_at:%Y-%m-%d}"
