import uuid
from pathlib import Path

from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.core.exceptions import ValidationError
from django.core.files.storage import FileSystemStorage
from django.core.validators import FileExtensionValidator
from django.db import models
from django.db.models.signals import post_delete
from django.dispatch import receiver
from django.utils import timezone

# Body photos are stored here instead of MEDIA_ROOT so that no static file
# handler can serve them -- see PRIVATE_MEDIA_ROOT in settings/base.py and
# BodyPhotoFileView, which is the only way to read one back.
private_media_storage = FileSystemStorage(location=settings.PRIVATE_MEDIA_ROOT)

_BYTES_PER_MB = 1024 * 1024


def validate_body_photo_size(value):
    """Refuse a photo over the image cap the rest of the app already uses
    (MEDIA_SIZE_LIMITS_MB in settings), so a straight-from-the-phone photo
    goes through but an accidental RAW export doesn't.

    On the model field rather than in the serializer, matching
    apps/moves/models.py: it then covers the Django admin as well, and DRF
    copies model-field validators onto the serializer field.
    """
    max_bytes = int(settings.MEDIA_SIZE_LIMITS_MB["image"]["max"] * _BYTES_PER_MB)
    if value.size > max_bytes:
        raise ValidationError(
            "Image is too large (%(size).1f MB). The limit is %(max).1f MB."
            % {"size": value.size / _BYTES_PER_MB, "max": max_bytes / _BYTES_PER_MB}
        )

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


def _body_photo_path(instance, filename):
    """Where a body photo lands on disk.

    The filename is random rather than derived from the pose or the member,
    so that even if this tree is ever accidentally exposed (a stray
    `static()` line, a misconfigured nginx location), the files can't be
    walked by guessing `body/7/front.jpg`. Belt and braces on top of
    PRIVATE_MEDIA_ROOT -- the storage location is the actual protection.
    """
    extension = Path(filename).suffix.lower().lstrip(".") or "jpg"
    return f"body/{instance.user_id}/{uuid.uuid4().hex}.{extension}"


class BodyPhoto(models.Model):
    """A member's front / side / back progress photo -- or, for the few who
    want to show more, an extra one.

    Trainers write better programmes when they can see posture and
    proportion -- where someone carries weight, how they stand -- which no
    tape measure captures. The member uploads them; only they and a
    trainer or admin can look at them.

    The three main poses are one row each at most: this is "what does this
    person look like right now", the reference a trainer works from.
    Re-uploading one replaces it (see BodyPhotoSerializer), and the old
    file is deleted rather than orphaned.

    Extras are for the serious lifters -- a back lat spread, a side chest,
    whatever their trainer asked to see. There can be several (up to
    MAX_EXTRAS), and they're just photos: what one shows is plain from the
    picture, so the member isn't made to name it, though they can leave a
    `note` for the trainer if they want. Most members never add one, and
    the three main poses stay exactly as they were.

    Note the storage= argument. These files deliberately do NOT live under
    MEDIA_ROOT, because everything there is served as a static file to
    anyone with the URL. See PRIVATE_MEDIA_ROOT in settings/base.py.
    """

    class Pose(models.TextChoices):
        FRONT = "front", "Front"
        SIDE = "side", "Side"
        BACK = "back", "Back"
        EXTRA = "extra", "Extra"

    # The three every member is asked for: one photo each, named by the
    # pose itself. The gym's example photos exist for these only.
    MAIN_POSES = [Pose.FRONT, Pose.SIDE, Pose.BACK]
    MAIN_POSE_CHOICES = [(pose.value, pose.label) for pose in MAIN_POSES]

    # Enough for every standard bodybuilding pose, and a bound on how much
    # of someone's body one account can park on the server. Mirrored in
    # front/src/constants/bodyPoses.js.
    MAX_EXTRAS = 8

    user = models.ForeignKey(User, related_name="body_photos", on_delete=models.CASCADE)
    pose = models.CharField(max_length=10, choices=Pose.choices)
    # Anything the member wants their trainer to know about an extra photo
    # ("۸ هفته بعد از شروع کات"). Optional, and only on extras.
    note = models.CharField(max_length=255, blank=True)
    image = models.ImageField(
        upload_to=_body_photo_path,
        storage=private_media_storage,
        validators=[
            FileExtensionValidator(allowed_extensions=["jpg", "jpeg", "png", "webp"]),
            validate_body_photo_size,
        ],
    )
    uploaded_at = models.DateTimeField(auto_now=True)

    class Meta:
        # Extras in the order they were added.
        ordering = ["pose", "id"]
        constraints = [
            # One photo per main pose; as many extras as MAX_EXTRAS allows.
            models.UniqueConstraint(
                fields=["user", "pose"],
                condition=~models.Q(pose="extra"),
                name="unique_body_photo_per_pose",
            )
        ]

    def __str__(self):
        return f"{self.user}: {self.get_pose_display()}"


@receiver(post_delete, sender=BodyPhoto)
def delete_body_photo_file(sender, instance, **kwargs):
    """Drop the image when its row goes.

    This matters more here than for ordinary media: a member deleting a
    body photo is withdrawing consent to have it stored, and leaving the
    file on disk would make the delete button a lie. post_delete rather
    than an override of delete() so it fires for cascades too -- deleting
    a user takes their photos with them.
    """
    if instance.image:
        instance.image.delete(save=False)


def _body_photo_example_path(instance, filename):
    extension = Path(filename).suffix.lower().lstrip(".") or "jpg"
    return f"body-examples/{instance.pose}-{uuid.uuid4().hex}.{extension}"


class BodyPhotoExample(models.Model):
    """A trainer's demonstration of what each body photo should look like.

    Members are being asked to photograph themselves in three specific
    angles, and "front / side / back" leaves a lot unsaid -- how far back
    to stand, arms where, what to wear. A trainer posing for the three
    shots answers all of that at once, in the one place it's needed: the
    empty slot the member is about to fill.

    Gym-wide rather than per member: one row per pose for everybody, which
    is what the unique constraint on `pose` enforces. Having none is a
    perfectly good state -- the slots simply sit empty, as they did before.

    Stored in the same private tree as members' own photos. These are
    posed deliberately for display, so they're readable by any signed-in
    user rather than just staff -- but they're still a photograph of a
    real person's body, and there's no reason for them to be fetchable by
    anyone who never logged in.
    """

    # Main poses only -- an extra is whatever the member says it is, so
    # there's no one picture of it for the gym to pose.
    pose = models.CharField(max_length=10, choices=BodyPhoto.MAIN_POSE_CHOICES, unique=True)
    image = models.ImageField(
        upload_to=_body_photo_example_path,
        storage=private_media_storage,
        validators=[
            FileExtensionValidator(allowed_extensions=["jpg", "jpeg", "png", "webp"]),
            validate_body_photo_size,
        ],
    )
    # Who to ask about it. SET_NULL so removing a trainer's account doesn't
    # take the gym's instructions down with it.
    uploaded_by = models.ForeignKey(
        User, related_name="+", on_delete=models.SET_NULL, null=True, blank=True
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["pose"]

    def __str__(self):
        return f"Example: {self.get_pose_display()}"


@receiver(post_delete, sender=BodyPhotoExample)
def delete_body_photo_example_file(sender, instance, **kwargs):
    """Same reasoning as delete_body_photo_file -- the trainer who posed
    for this gets to have it actually gone when it's removed."""
    if instance.image:
        instance.image.delete(save=False)
