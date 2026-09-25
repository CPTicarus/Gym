from django.contrib.auth import get_user_model
from django.core.validators import FileExtensionValidator
from django.urls import reverse
from django.utils import timezone
from rest_framework import serializers
from rest_framework.validators import UniqueValidator
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import (
    BodyMeasurement,
    BodyPhoto,
    BodyPhotoExample,
    HealthCondition,
    normalize_digits,
    validate_body_photo_size,
)
from .passwords import validate_password_for_role

User = get_user_model()

# Iranian کد ملی. Length is checked, the check digit deliberately isn't —
# a checksum would also turn away anyone whose ID doesn't follow that
# scheme, and a gym signing up a foreign member shouldn't be blocked at
# the front desk.
NATIONAL_ID_LENGTH = 10


class NationalIdField(serializers.CharField):
    """A کد ملی: folded to ASCII digits and length-checked at PARSE time.

    The timing is the whole point. DRF runs a field's `to_internal_value`
    first, then the field's `validators`, and only then the serializer's
    `validate_<name>` hook. Normalising in the last of those would leave
    UniqueValidator comparing whatever the user actually typed — so the
    same ID entered with Persian digits would look distinct from its ASCII
    twin, pass the uniqueness check, and then blow up at the INSERT as a
    500. Doing it here means the value is already canonical by the time
    anything is compared against the database.
    """

    def to_internal_value(self, data):
        digits = normalize_digits(super().to_internal_value(data)).strip()
        if not digits.isdigit() or len(digits) != NATIONAL_ID_LENGTH:
            raise serializers.ValidationError(
                f"National ID must be exactly {NATIONAL_ID_LENGTH} digits."
            )
        return digits


class _NationalIdFieldMixin(serializers.Serializer):
    """Declares `national_id` wherever it's writable.

    Declared by hand rather than left to ModelSerializer so it can be a
    NationalIdField (see above) — the generated one would be a plain
    CharField and would normalise nothing.

    That hand-declaration is also why UniqueValidator is spelled out here.
    A generated field would have inherited it from the model's
    `unique=True`; a declared one does not, and without it a duplicate ID
    sails past validation and only fails at the INSERT — surfacing as a
    500 rather than a field error the front desk can read.
    """

    national_id = NationalIdField(
        required=True,
        allow_blank=False,
        validators=[
            UniqueValidator(
                queryset=User.objects.all(),
                message="An account with this national ID already exists.",
            )
        ],
    )


class _RequiredIdentityFieldsMixin(_NationalIdFieldMixin):
    """Who a new account belongs to. Every creation path demands these;
    email is the one contact detail left optional, since plenty of members
    haven't got one to give."""

    first_name = serializers.CharField(required=True, allow_blank=False)
    last_name = serializers.CharField(required=True, allow_blank=False)
    phone_number = serializers.CharField(required=True, allow_blank=False)

    def validate_phone_number(self, value):
        return normalize_digits(value).strip()


class HealthConditionSerializer(serializers.ModelSerializer):
    """Something a trainer needs to know about. `condition` is a code from
    a fixed list so it stays machine-readable; OTHER carries the member's
    own wording in `description`."""

    condition_display = serializers.CharField(source="get_condition_display", read_only=True)

    class Meta:
        model = HealthCondition
        fields = ["id", "condition", "condition_display", "description", "notes", "created_at"]
        read_only_fields = ["id", "condition_display", "created_at"]

    def validate(self, attrs):
        condition = attrs.get("condition", getattr(self.instance, "condition", None))
        description = attrs.get("description", getattr(self.instance, "description", ""))
        if condition == HealthCondition.Condition.OTHER and not (description or "").strip():
            raise serializers.ValidationError(
                {"description": "Describe the condition when choosing 'other'."}
            )

        # The database has a CONDITIONAL unique constraint on
        # (user, condition) that exempts OTHER. DRF only auto-generates
        # validators for plain unique_together, and `user` isn't a
        # serializer field anyway (the view supplies it) — so without this
        # check a re-ticked flag reaches the INSERT and surfaces as a 500
        # instead of a field error.
        if condition and condition != HealthCondition.Condition.OTHER:
            user = getattr(self.context.get("request"), "user", None)
            if user and user.is_authenticated:
                clash = HealthCondition.objects.filter(user=user, condition=condition)
                if self.instance is not None:
                    clash = clash.exclude(pk=self.instance.pk)
                if clash.exists():
                    raise serializers.ValidationError(
                        {"condition": "This condition is already on your list."}
                    )
        return attrs


class _BodyMetricsFieldsMixin(serializers.Serializer):
    """Shared read-only body-metrics fields, mixed into every serializer
    that shows a user's profile (list/admin/self). All of these are
    derived (see User model), never written directly — the numbers behind
    them only change through a BodyMeasurement entry."""

    latest_weight_kg = serializers.FloatField(read_only=True)
    latest_waist_cm = serializers.FloatField(read_only=True)
    latest_hips_cm = serializers.FloatField(read_only=True)
    latest_chest_cm = serializers.FloatField(read_only=True)
    latest_arm_cm = serializers.FloatField(read_only=True)
    latest_thigh_cm = serializers.FloatField(read_only=True)
    whr = serializers.FloatField(read_only=True)
    whtr = serializers.FloatField(read_only=True)
    bmi = serializers.FloatField(read_only=True)


class UserSerializer(_BodyMetricsFieldsMixin, serializers.ModelSerializer):
    """General-purpose read serializer — e.g. admin's user directory,
    or a member looking up a trainer's basic info."""

    is_membership_active = serializers.BooleanField(read_only=True)
    # Read-only here on purpose: a trainer needs to know about a bad knee
    # before writing a programme, but it's the member's own health record
    # and only they edit it (see HealthConditionViewSet).
    health_conditions = HealthConditionSerializer(many=True, read_only=True)

    class Meta:
        model = User
        fields = [
            "id", "username", "national_id", "email", "first_name", "last_name",
            "role", "phone_number", "date_of_birth", "gender",
            "profile_picture", "membership_start_date", "membership_end_date",
            "is_membership_active", "height_cm", "latest_weight_kg", "latest_waist_cm",
            "latest_hips_cm", "latest_chest_cm", "latest_arm_cm", "latest_thigh_cm",
            "whr", "whtr", "bmi", "health_conditions", "created_at",
        ]
        read_only_fields = [
            "id", "role", "national_id", "created_at", "is_membership_active", "height_cm",
        ]


class UserAdminSerializer(_NationalIdFieldMixin, _BodyMetricsFieldsMixin, serializers.ModelSerializer):
    """Admin's full edit view of another user — profile, role, membership
    window, and active flag. Password is deliberately absent: resetting
    someone else's password is a separate concern with its own risks, not
    something to fold into a general profile PATCH. Height/weight are
    read-only here too — those are the member's own call, entered via
    their own profile (MeSerializer) and weight log, not set on their
    behalf by an admin."""

    is_membership_active = serializers.BooleanField(read_only=True)
    health_conditions = HealthConditionSerializer(many=True, read_only=True)

    class Meta:
        model = User
        fields = [
            "id", "username", "national_id", "email", "first_name", "last_name",
            "role", "phone_number", "date_of_birth", "gender",
            "profile_picture", "membership_start_date", "membership_end_date",
            "is_membership_active", "height_cm", "latest_weight_kg", "latest_waist_cm",
            "latest_hips_cm", "latest_chest_cm", "latest_arm_cm", "latest_thigh_cm",
            "whr", "whtr", "bmi", "health_conditions", "is_active", "created_at",
        ]
        read_only_fields = ["id", "username", "created_at", "is_membership_active", "height_cm"]


class MemberEditSerializer(_NationalIdFieldMixin, serializers.ModelSerializer):
    """What accounting may change about a member: their details and their
    membership window.

    `role` and `is_active` are absent, and that absence is the point. If
    accounting could set a role, it could promote a member it just created
    to admin — which would make the rule that only admins create staff
    accounts (UserViewSet.perform_create) worth nothing. Whether accounting
    may reach this record at all is decided separately, per object, by
    can_manage_user.
    """

    is_membership_active = serializers.BooleanField(read_only=True)

    class Meta:
        model = User
        fields = [
            "id", "username", "national_id", "email", "first_name", "last_name",
            "role", "phone_number", "date_of_birth", "gender",
            "membership_start_date", "membership_end_date", "is_membership_active",
        ]
        read_only_fields = ["id", "username", "role", "is_membership_active"]

    def validate_phone_number(self, value):
        return normalize_digits(value).strip()

    def validate(self, attrs):
        start = attrs.get("membership_start_date", getattr(self.instance, "membership_start_date", None))
        end = attrs.get("membership_end_date", getattr(self.instance, "membership_end_date", None))
        if start and end and end < start:
            raise serializers.ValidationError(
                {"membership_end_date": "End date cannot be earlier than the start date."}
            )
        return attrs


class UserCreateSerializer(_RequiredIdentityFieldsMixin, serializers.ModelSerializer):
    """Staff-side account creation — the front desk making an account on
    someone's behalf.

    `role` defaults to MEMBER, which is the overwhelming case and the only
    one accounting is allowed to create (the view narrows it — see
    UserViewSet.perform_create). An admin can create any role here rather
    than being sent to a second endpoint for staff.

    Membership dates only mean anything for members; they're dropped for
    staff roles rather than quietly stored on an account whose
    `is_membership_active` nobody will ever read.
    """

    password = serializers.CharField(write_only=True)
    role = serializers.ChoiceField(choices=User.Role.choices, default=User.Role.MEMBER)


    class Meta:
        model = User
        fields = [
            "id", "username", "national_id", "email", "password", "role",
            "first_name", "last_name", "phone_number", "date_of_birth", "gender",
            "membership_start_date", "membership_end_date",
        ]
        read_only_fields = ["id"]

    def validate(self, attrs):
        start = attrs.get("membership_start_date")
        end = attrs.get("membership_end_date")
        if start and end and end < start:
            raise serializers.ValidationError(
                {"membership_end_date": "End date cannot be earlier than the start date."}
            )

        role = attrs.get("role", User.Role.MEMBER)
        # Password rules follow the role being created, not the endpoint:
        # a member gets the relaxed bar, staff get the full validators.
        validate_password_for_role(
            attrs.get("password"),
            role,
            user=User(
                username=attrs.get("username", ""),
                email=attrs.get("email", ""),
                first_name=attrs.get("first_name", ""),
                last_name=attrs.get("last_name", ""),
            ),
        )
        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password")
        if validated_data.get("role", User.Role.MEMBER) != User.Role.MEMBER:
            validated_data.pop("membership_start_date", None)
            validated_data.pop("membership_end_date", None)
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class RegisterSerializer(_RequiredIdentityFieldsMixin, serializers.ModelSerializer):
    """Public self sign-up. Always creates a MEMBER — trainer/admin/accounting
    accounts are created by an admin via StaffCreateSerializer instead."""

    password = serializers.CharField(write_only=True)
    password_confirm = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = [
            "username", "national_id", "email", "password", "password_confirm",
            "first_name", "last_name", "phone_number",
        ]

    def validate(self, attrs):
        if attrs["password"] != attrs.pop("password_confirm"):
            raise serializers.ValidationError({"password_confirm": "Passwords do not match."})
        # Self sign-up only ever makes a member, so it gets the member rule
        # — the bar follows the role, not the door the account came in by.
        validate_password_for_role(attrs["password"], User.Role.MEMBER)
        return attrs

    def create(self, validated_data):
        validated_data["role"] = User.Role.MEMBER
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class StaffCreateSerializer(_RequiredIdentityFieldsMixin, serializers.ModelSerializer):
    """Admin-only: create trainer / admin / accounting accounts.

    Kept for API compatibility; the dashboard now creates every role
    through UserCreateSerializer instead.
    """

    password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = [
            "username", "national_id", "email", "password", "first_name",
            "last_name", "phone_number", "role",
        ]

    def validate_role(self, value):
        if value == User.Role.MEMBER:
            raise serializers.ValidationError(
                "Use POST /api/users/ to create member accounts."
            )
        return value

    def validate(self, attrs):
        validate_password_for_role(attrs.get("password"), attrs.get("role"))
        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class SetPasswordSerializer(serializers.Serializer):
    """Staff setting someone else's password.

    Note there is no `old_password` and no way to read the current one:
    Django stores a one-way hash, so the existing password cannot be
    displayed, only replaced. The policy applied is the TARGET's, not the
    requester's — resetting a member to a 4-digit PIN is fine, resetting a
    trainer to one is not.
    """

    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        target = self.context["target"]
        validate_password_for_role(attrs["password"], target.role, user=target)
        return attrs


class MeSerializer(_BodyMetricsFieldsMixin, serializers.ModelSerializer):
    """What a logged-in user sees/edits about themselves. Role and membership
    dates are read-only here — those only change via admin/accounting actions.
    height_cm is the one body-metric field writable here; weight is entered
    through the separate weight-log endpoint instead, since it's tracked
    over time rather than as a single value."""

    is_membership_active = serializers.BooleanField(read_only=True)

    class Meta:
        model = User
        fields = [
            "id", "username", "national_id", "email", "first_name", "last_name",
            "role", "phone_number", "date_of_birth", "gender",
            "profile_picture", "membership_start_date", "membership_end_date",
            "is_membership_active", "height_cm", "latest_weight_kg", "latest_waist_cm",
            "latest_hips_cm", "latest_chest_cm", "latest_arm_cm", "latest_thigh_cm",
            "whr", "whtr", "bmi",
        ]
        # national_id is shown but not self-editable: correcting one is an
        # identity change, which belongs with an admin, not with the person
        # whose identity it is.
        read_only_fields = [
            "id", "username", "national_id", "role",
            "membership_start_date", "membership_end_date", "is_membership_active",
        ]

    def validate_height_cm(self, value):
        if value is not None and value <= 0:
            raise serializers.ValidationError("Height must be greater than zero.")
        return value


class BodyMeasurementSerializer(serializers.ModelSerializer):
    """A member's own dated numbers.

    `create` upserts by day, and MERGES rather than replaces: posting a
    waist measurement for a date that already has a weight keeps the
    weight. A replace would silently wipe the other half of the day's
    entry — and quietly destroying data the member typed earlier is worse
    than any convenience an overwrite buys.
    """

    whr = serializers.FloatField(read_only=True)
    whtr = serializers.FloatField(read_only=True)

    class Meta:
        model = BodyMeasurement
        fields = [
            "id", "weight_kg", "waist_cm", "hips_cm", "chest_cm", "arm_cm", "thigh_cm",
            "whr", "whtr", "recorded_at", "created_at",
        ]
        read_only_fields = ["id", "whr", "whtr", "created_at"]

    def _validate_positive(self, value, label):
        if value is not None and value <= 0:
            raise serializers.ValidationError(f"{label} must be greater than zero.")
        return value

    def validate_weight_kg(self, value):
        return self._validate_positive(value, "Weight")

    def validate_waist_cm(self, value):
        return self._validate_positive(value, "Waist")

    def validate_hips_cm(self, value):
        return self._validate_positive(value, "Hips")

    def validate_chest_cm(self, value):
        return self._validate_positive(value, "Chest")

    def validate_arm_cm(self, value):
        return self._validate_positive(value, "Arm")

    def validate_thigh_cm(self, value):
        return self._validate_positive(value, "Thigh")

    def validate(self, attrs):
        # An entry with nothing in it is not an entry.
        measured = [
            attrs.get(f)
            for f in ("weight_kg", "waist_cm", "hips_cm", "chest_cm", "arm_cm", "thigh_cm")
        ]
        if self.instance is None and all(v is None for v in measured):
            raise serializers.ValidationError("Record at least one measurement.")
        return attrs

    def create(self, validated_data):
        user = validated_data.pop("user")
        recorded_at = validated_data.pop("recorded_at", None) or timezone.localdate()
        entry, _ = BodyMeasurement.objects.get_or_create(user=user, recorded_at=recorded_at)
        for field, value in validated_data.items():
            setattr(entry, field, value)
        entry.save()
        return entry


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Adds role + display name into the JWT payload itself, so the frontend
    can pick the right layout/route immediately after login without an
    extra round trip to /auth/me/."""

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["role"] = user.role
        token["full_name"] = user.get_full_name() or user.username
        return token


class BodyPhotoSerializer(serializers.ModelSerializer):
    """One progress photo.

    `image` is write-only and `file_url` is what goes out. The stored path
    is useless to a client anyway -- these files are not served statically
    (that is the whole point of PRIVATE_MEDIA_ROOT) -- and exposing it
    would invite someone to try /media/body/... and wonder why it 404s.
    The URL given instead points at the permission-checked streaming view.

    An extra needs nothing but the image -- what it shows is plain from the
    photo. Its `note` is optional; the three main poses don't take one.
    """

    # Declaring the field explicitly (for write_only) means DRF does NOT
    # copy the model field's validators onto it, so the extension allowlist
    # and the size cap have to be restated here or they simply never run.
    image = serializers.ImageField(
        write_only=True,
        validators=[
            FileExtensionValidator(allowed_extensions=["jpg", "jpeg", "png", "webp"]),
            validate_body_photo_size,
        ],
    )
    file_url = serializers.SerializerMethodField()
    pose_display = serializers.CharField(source="get_pose_display", read_only=True)

    class Meta:
        model = BodyPhoto
        fields = ["id", "pose", "pose_display", "note", "image", "file_url", "uploaded_at"]
        read_only_fields = ["id", "pose_display", "file_url", "uploaded_at"]

    def get_file_url(self, obj):
        url = reverse("body-photo-file", kwargs={"pk": obj.pk})
        request = self.context.get("request")
        return request.build_absolute_uri(url) if request else url

    def validate(self, attrs):
        pose = attrs.get("pose", getattr(self.instance, "pose", None))
        if self.instance is not None and pose != self.instance.pose:
            raise serializers.ValidationError(
                {"pose": "A photo's pose can't be changed -- upload it as the other pose instead."}
            )

        if pose != BodyPhoto.Pose.EXTRA:
            if attrs.get("note"):
                raise serializers.ValidationError({"note": "Only an extra photo takes a note."})
            return attrs

        if self.instance is None:
            count = BodyPhoto.objects.filter(
                user=self.context["request"].user, pose=BodyPhoto.Pose.EXTRA
            ).count()
            if count >= BodyPhoto.MAX_EXTRAS:
                raise serializers.ValidationError(
                    {"pose": f"At most {BodyPhoto.MAX_EXTRAS} extra photos -- delete one to add another."}
                )
        return attrs

    def create(self, validated_data):
        """Upload-or-replace, keyed on the pose -- for the main poses.

        A member re-taking their front photo is updating one thing, not
        adding a second front photo -- and the unique constraint would
        reject the second one anyway, turning an ordinary action into a
        400. The old file is deleted rather than left behind, because a
        replaced body photo is one the member no longer wants stored.

        An extra is always a new photo: there can be several, so there's
        nothing to key a replacement on. Replacing one is a PATCH to it.
        """
        user = validated_data["user"]
        pose = validated_data["pose"]
        if pose != BodyPhoto.Pose.EXTRA:
            existing = BodyPhoto.objects.filter(user=user, pose=pose).first()
            if existing:
                existing.image.delete(save=False)
                existing.image = validated_data["image"]
                existing.save()
                return existing
        return super().create(validated_data)

    def update(self, instance, validated_data):
        """PATCH: a new image for this photo, a note for an extra (blank
        clears it), or both. Like a replacement in create(), the old file
        goes."""
        image = validated_data.pop("image", None)
        if image is not None:
            instance.image.delete(save=False)
            instance.image = image
        return super().update(instance, validated_data)


class BodyPhotoExampleSerializer(serializers.ModelSerializer):
    """The gym's demonstration photo for one pose.

    Same write-only image / read-only URL split as BodyPhotoSerializer, and
    for the same reason: the stored path is not a thing a client can fetch.
    """

    # `pose` is unique=True on the model, so DRF would fit this field with a
    # UniqueValidator and reject the second POST for a pose at validation
    # time -- before create() below ever gets the chance to treat it as the
    # replacement it is. Dropping the validator is safe because create()
    # looks the row up itself, and the database constraint is still there
    # for anything that bypasses this serializer.
    pose = serializers.ChoiceField(choices=BodyPhoto.MAIN_POSE_CHOICES, validators=[])
    image = serializers.ImageField(
        write_only=True,
        validators=[
            FileExtensionValidator(allowed_extensions=["jpg", "jpeg", "png", "webp"]),
            validate_body_photo_size,
        ],
    )
    file_url = serializers.SerializerMethodField()
    pose_display = serializers.CharField(source="get_pose_display", read_only=True)
    uploaded_by_name = serializers.CharField(source="uploaded_by.get_full_name", read_only=True)

    class Meta:
        model = BodyPhotoExample
        fields = [
            "id", "pose", "pose_display", "image", "file_url",
            "uploaded_by_name", "updated_at",
        ]
        read_only_fields = ["id", "pose_display", "file_url", "uploaded_by_name", "updated_at"]

    def get_file_url(self, obj):
        url = reverse("body-photo-example-file", kwargs={"pk": obj.pk})
        request = self.context.get("request")
        return request.build_absolute_uri(url) if request else url

    def create(self, validated_data):
        """Upload-or-replace, keyed on the pose — there is exactly one
        example per pose gym-wide, so posting "front" again is a trainer
        re-shooting the demonstration, not adding a second one."""
        pose = validated_data["pose"]
        existing = BodyPhotoExample.objects.filter(pose=pose).first()
        if existing:
            existing.image.delete(save=False)
            existing.image = validated_data["image"]
            existing.uploaded_by = validated_data.get("uploaded_by")
            existing.save()
            return existing
        return super().create(validated_data)
