from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone


class User(AbstractUser):
    """
    Single user model for all four user types (member / trainer / admin /
    accounting). Role-based permissions live in permissions.py and check
    against `role` — this keeps auth, profile data, and membership info in
    one place instead of spreading them across role-specific tables.

    Note: this `role` is a business concept, separate from Django's own
    `is_staff` / `is_superuser`, which we reserve for actual access to the
    Django admin site (devs / site operators), not gym staff.
    """

    class Role(models.TextChoices):
        MEMBER = "member", "Member"
        TRAINER = "trainer", "Trainer"
        ADMIN = "admin", "Admin"
        ACCOUNTING = "accounting", "Accounting"

    role = models.CharField(max_length=20, choices=Role.choices, default=Role.MEMBER)

    phone_number = models.CharField(max_length=20, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    gender = models.CharField(max_length=10, blank=True)
    profile_picture = models.ImageField(upload_to="profiles/", null=True, blank=True)

    height_cm = models.FloatField(null=True, blank=True)

    # Membership window — this is what the accounting app reads from.
    membership_start_date = models.DateField(null=True, blank=True)
    membership_end_date = models.DateField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.get_full_name() or self.username} ({self.role})"

    @property
    def is_membership_active(self):
        if not self.membership_end_date:
            return False
        return self.membership_end_date >= timezone.now().date()

    # Small convenience properties so views/permissions/templates read
    # `user.is_trainer` instead of `user.role == User.Role.TRAINER` everywhere.
    @property
    def is_member(self):
        return self.role == self.Role.MEMBER

    @property
    def is_trainer(self):
        return self.role == self.Role.TRAINER

    @property
    def is_gym_admin(self):
        return self.role == self.Role.ADMIN

    @property
    def is_accounting(self):
        return self.role == self.Role.ACCOUNTING

    @property
    def latest_weight_log(self):
        # `list(...all())` (rather than re-filtering/re-ordering) so this
        # reads from a `prefetch_related("weight_logs")` cache when one is
        # present instead of firing a fresh query per user in a list view.
        logs = list(self.weight_logs.all())
        return logs[0] if logs else None

    @property
    def latest_weight_kg(self):
        log = self.latest_weight_log
        return log.weight_kg if log else None

    @property
    def bmi(self):
        """Body Mass Index from height + the most recent logged weight.
        None if either is missing — there's nothing to compute yet."""
        weight = self.latest_weight_kg
        if not weight or not self.height_cm:
            return None
        height_m = self.height_cm / 100
        return round(weight / (height_m**2), 1)


class WeightLog(models.Model):
    """A single dated weight measurement for a user, so weight can be
    tracked over time (a trend line, not just a snapshot). One entry per
    user per day — logging again for a day already recorded updates it
    (see WeightLogSerializer) rather than piling up duplicates."""

    user = models.ForeignKey(User, related_name="weight_logs", on_delete=models.CASCADE)
    weight_kg = models.FloatField()
    recorded_at = models.DateField(default=timezone.localdate)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-recorded_at", "-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["user", "recorded_at"], name="unique_weight_log_per_user_per_day")
        ]

    def __str__(self):
        return f"{self.user}: {self.weight_kg}kg on {self.recorded_at}"
