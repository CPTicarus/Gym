from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone

# Persian (۰-۹) and Arabic-Indic (٠-٩) digits mapped onto ASCII. A Persian
# keyboard produces the former, and a national ID or phone number typed
# that way is the same number — it just wouldn't match a [0-9] check, or
# compare equal to the same ID typed on an English keyboard. Normalising at
# the edge means only one form is ever stored.
DIGIT_TRANSLATION = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")


def normalize_digits(value):
    """Rewrite any Persian/Arabic-Indic digits in `value` as ASCII ones."""
    return str(value or "").translate(DIGIT_TRANSLATION)


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

    class Gender(models.TextChoices):
        MALE = "male", "Male"
        FEMALE = "female", "Female"

    phone_number = models.CharField(max_length=20, blank=True)

    national_id = models.CharField(max_length=20, unique=True)
    date_of_birth = models.DateField(null=True, blank=True)
    # Optional: blank means not stated, which is why there's no "other"
    # option — an optional field doesn't need one to avoid forcing an
    # answer. Choices rather than free text so the value stays comparable
    # (it's already "male"/"female" in existing rows).
    gender = models.CharField(max_length=10, choices=Gender.choices, blank=True)
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

    def _latest_with(self, field):
        """The newest measurement that actually recorded `field`.

        Not simply the newest row: every field is optional, so someone who
        weighed themselves today after measuring their waist last week has
        a latest row with no waist in it. Each number is read from the last
        entry that carries one.

        `list(...all())` (rather than re-filtering per field) so this reads
        from a `prefetch_related("measurements")` cache when one is present
        instead of firing a fresh query per user in a list view.
        """
        for entry in self.measurements.all():
            value = getattr(entry, field)
            if value is not None:
                return value
        return None

    @property
    def latest_measurement(self):
        entries = list(self.measurements.all())
        return entries[0] if entries else None

    @property
    def latest_weight_kg(self):
        return self._latest_with("weight_kg")

    @property
    def latest_waist_cm(self):
        return self._latest_with("waist_cm")

    @property
    def latest_hips_cm(self):
        return self._latest_with("hips_cm")

    @property
    def latest_chest_cm(self):
        return self._latest_with("chest_cm")

    @property
    def latest_arm_cm(self):
        return self._latest_with("arm_cm")

    @property
    def latest_thigh_cm(self):
        return self._latest_with("thigh_cm")

    @property
    def whr(self):
        """Waist-to-hip ratio, read from the most recent entry that has
        BOTH numbers. Mixing a waist from today with hips from a month ago
        would produce a ratio that describes no actual body."""
        for entry in self.measurements.all():
            ratio = entry.whr
            if ratio is not None:
                return ratio
        return None

    @property
    def whtr(self):
        """Waist-to-height ratio from height + the most recent logged waist.

        Unlike WHR, its risk bands are the same for everyone (see
        getWhtrCategory in the frontend), so this is the one ratio that
        still means something for a member with no recorded gender."""
        waist = self.latest_waist_cm
        if not waist or not self.height_cm:
            return None
        return round(waist / self.height_cm, 2)

    @property
    def bmi(self):
        """Body Mass Index from height + the most recent logged weight.
        None if either is missing — there's nothing to compute yet."""
        weight = self.latest_weight_kg
        if not weight or not self.height_cm:
            return None
        height_m = self.height_cm / 100
        return round(weight / (height_m**2), 1)


class BodyMeasurement(models.Model):
    """One dated set of a member's own numbers.

    Was WeightLog, and grew: a member steps on the scale and picks up the
    tape measure in the same session, so a single dated row holds whatever
    they recorded that day. Keeping them together is also what makes the
    waist-to-hip ratio meaningful — both halves come from one sitting
    rather than being stitched together across weeks.

    Every value is optional, including weight: recording only a waist
    measurement is a legitimate entry. One row per user per day — logging
    again for a day already recorded merges into it (see
    BodyMeasurementSerializer) rather than piling up duplicates.
    """

    user = models.ForeignKey(User, related_name="measurements", on_delete=models.CASCADE)
    weight_kg = models.FloatField(null=True, blank=True)
    waist_cm = models.FloatField(null=True, blank=True)
    hips_cm = models.FloatField(null=True, blank=True)
    chest_cm = models.FloatField(null=True, blank=True)
    arm_cm = models.FloatField(null=True, blank=True)
    thigh_cm = models.FloatField(null=True, blank=True)
    recorded_at = models.DateField(default=timezone.localdate)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-recorded_at", "-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "recorded_at"], name="unique_measurement_per_user_per_day"
            )
        ]

    def __str__(self):
        return f"{self.user}: {self.recorded_at}"

    @property
    def whr(self):
        """Waist-to-hip ratio for this entry, or None if either half is
        missing. Two decimals — the health thresholds it gets compared
        against are quoted to two."""
        if not self.waist_cm or not self.hips_cm:
            return None
        return round(self.waist_cm / self.hips_cm, 2)

    @property
    def whtr(self):
        """Waist-to-height ratio for this entry.

        Height comes from the user rather than the row, since it isn't
        tracked over time — which means a very old entry is divided by
        today's height. Harmless for adults, and the alternative (storing
        height on every row) would ask people to re-enter a number that
        doesn't change. Reading it does touch `self.user`, so querysets
        that serialize this select_related("user").
        """
        height = self.user.height_cm if self.user_id else None
        if not self.waist_cm or not height:
            return None
        return round(self.waist_cm / height, 2)


class HealthCondition(models.Model):
    """Something a member has that a trainer needs to know before writing
    them a programme — a bad knee, a bad back, asthma.

    Stored as a CODE from a fixed list rather than free text, so a future
    plan feature can actually act on it (refuse to assign squats to
    someone flagged KNEE_PAIN, say) instead of grepping prose. The list
    won't cover everyone, hence OTHER plus `description` — that entry
    still shows up for the trainer, it just can't be reasoned about
    automatically.

    `notes` is for the detail that matters to a human: which knee, since
    when, what a physio said.
    """

    class Condition(models.TextChoices):
        BACK_PAIN = "back_pain", "Back pain"
        KNEE_PAIN = "knee_pain", "Knee pain"
        SHOULDER_PAIN = "shoulder_pain", "Shoulder pain"
        NECK_PAIN = "neck_pain", "Neck pain"
        WRIST_PAIN = "wrist_pain", "Wrist pain"
        ANKLE_PAIN = "ankle_pain", "Ankle pain"
        HERNIA = "hernia", "Hernia"
        ASTHMA = "asthma", "Asthma"
        HEART_CONDITION = "heart_condition", "Heart condition"
        HIGH_BLOOD_PRESSURE = "high_blood_pressure", "High blood pressure"
        DIABETES = "diabetes", "Diabetes"
        RECENT_SURGERY = "recent_surgery", "Recent surgery"
        PREGNANCY = "pregnancy", "Pregnancy"
        OTHER = "other", "Other"

    user = models.ForeignKey(User, related_name="health_conditions", on_delete=models.CASCADE)
    condition = models.CharField(max_length=30, choices=Condition.choices)
    # Required for OTHER (enforced in the serializer), meaningless otherwise.
    description = models.CharField(max_length=100, blank=True)
    notes = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["condition", "id"]
        constraints = [
            # A listed condition can only be flagged once — ticking "back
            # pain" twice says nothing. OTHER is exempt: two different
            # write-ins are two different conditions.
            models.UniqueConstraint(
                fields=["user", "condition"],
                condition=~models.Q(condition="other"),
                name="unique_listed_condition_per_user",
            )
        ]

    def __str__(self):
        label = self.description if self.condition == self.Condition.OTHER else self.get_condition_display()
        return f"{self.user}: {label}"
