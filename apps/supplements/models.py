from django.conf import settings
from django.db import models


class SupplementPlan(models.Model):
    """What a member takes alongside training — protein powder, creatine,
    vitamins, whatever the trainer has decided on.

    Same build-once-then-assign shape as workout and diet plans, and for
    the same reason: a protocol is written once and given to whichever
    members it suits. Unlike those two, though, most members never get one
    — this is for the few training seriously enough to need it, so the
    absence of an assignment is the normal case, not a gap to fill.

    A flat list of items rather than diet's day/meal nesting: a supplement
    protocol is a standing list where each entry carries its own timing
    ("after training", "before bed"), not a different set for each day of
    the week.

    This records what a trainer prescribes; the app doesn't suggest
    products or doses.
    """

    class Goal(models.TextChoices):
        BULKING = "bulking", "Bulking"
        CUTTING = "cutting", "Cutting"
        RECOVERY = "recovery", "Recovery"
        PERFORMANCE = "performance", "Performance"
        GENERAL = "general", "General"
        OTHER = "other", "Other"

    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    goal = models.CharField(max_length=20, choices=Goal.choices, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="supplement_plans_created",
        on_delete=models.SET_NULL,
        null=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.name


class SupplementItem(models.Model):
    """One entry in a protocol: what to take, how much, and when.

    `dosage` and `timing` are free text on purpose. A gym writes "۳۰ گرم"
    or "1 scoop" or "2 عدد" depending on the product, and pinning it to a
    number plus a unit dropdown would just mean fighting the form on every
    entry that doesn't fit."""

    plan = models.ForeignKey(SupplementPlan, related_name="items", on_delete=models.CASCADE)
    name = models.CharField(max_length=100)
    dosage = models.CharField(max_length=50, blank=True)
    timing = models.CharField(max_length=100, blank=True)
    frequency = models.CharField(max_length=50, blank=True)
    notes = models.CharField(max_length=255, blank=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return f"{self.plan.name}: {self.name}"


class SupplementAssignment(models.Model):
    """Who is on this protocol. Mirrors WorkoutAssignment and
    DietAssignment so all three behave identically from the frontend."""

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        PAUSED = "paused", "Paused"
        COMPLETED = "completed", "Completed"

    plan = models.ForeignKey(SupplementPlan, related_name="assignments", on_delete=models.CASCADE)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="supplement_assignments", on_delete=models.CASCADE
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

    def save(self, *args, **kwargs):
        # One active protocol per member — anything else is history.
        # Enforced here rather than only in the assign view so it also
        # covers reactivating an old assignment through any path.
        if self.status == self.Status.ACTIVE:
            SupplementAssignment.objects.filter(
                user_id=self.user_id, status=self.Status.ACTIVE
            ).exclude(pk=self.pk).update(status=self.Status.COMPLETED)
        super().save(*args, **kwargs)
