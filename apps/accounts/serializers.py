from django.contrib.auth import get_user_model
from rest_framework import serializers
from rest_framework.validators import UniqueValidator
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import WeightLog, normalize_digits
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

    The field is declared by hand rather than left to ModelSerializer,
    because the model must keep allowing blanks (accounts that predate the
    column) while every path that writes one has to demand it.

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


class _BodyMetricsFieldsMixin(serializers.Serializer):
    """Shared read-only body-metrics fields, mixed into every serializer
    that shows a user's profile (list/admin/self). `latest_weight_kg` and
    `bmi` are derived (see User model), never written directly — weight
    only changes through a WeightLog entry."""

    latest_weight_kg = serializers.FloatField(read_only=True)
    bmi = serializers.FloatField(read_only=True)


class UserSerializer(_BodyMetricsFieldsMixin, serializers.ModelSerializer):
    """General-purpose read serializer — e.g. admin's user directory,
    or a member looking up a trainer's basic info."""

    is_membership_active = serializers.BooleanField(read_only=True)

    class Meta:
        model = User
        fields = [
            "id", "username", "national_id", "email", "first_name", "last_name",
            "role", "phone_number", "date_of_birth", "gender",
            "profile_picture", "membership_start_date", "membership_end_date",
            "is_membership_active", "height_cm", "latest_weight_kg", "bmi", "created_at",
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

    class Meta:
        model = User
        fields = [
            "id", "username", "national_id", "email", "first_name", "last_name",
            "role", "phone_number", "date_of_birth", "gender",
            "profile_picture", "membership_start_date", "membership_end_date",
            "is_membership_active", "height_cm", "latest_weight_kg", "bmi", "is_active", "created_at",
        ]
        read_only_fields = ["id", "username", "created_at", "is_membership_active", "height_cm"]


class MembershipUpdateSerializer(serializers.ModelSerializer):
    """What accounting is allowed to change: the membership window only.
    Everything else stays read-only, so billing staff can renew or expire
    someone without being able to edit profiles or change roles."""

    is_membership_active = serializers.BooleanField(read_only=True)

    class Meta:
        model = User
        fields = [
            "id", "username", "first_name", "last_name", "role",
            "membership_start_date", "membership_end_date", "is_membership_active",
        ]
        read_only_fields = ["id", "username", "first_name", "last_name", "role", "is_membership_active"]

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
            "is_membership_active", "height_cm", "latest_weight_kg", "bmi",
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


class WeightLogSerializer(serializers.ModelSerializer):
    """A member's own weight-tracking entries. `create` upserts by day —
    logging again for a date already recorded updates that entry instead
    of creating a duplicate (mirrors the model's one-per-day constraint),
    so "log today's weight" stays idempotent from the frontend's view."""

    class Meta:
        model = WeightLog
        fields = ["id", "weight_kg", "recorded_at", "created_at"]
        read_only_fields = ["id", "created_at"]

    def validate_weight_kg(self, value):
        if value <= 0:
            raise serializers.ValidationError("Weight must be greater than zero.")
        return value

    def create(self, validated_data):
        user = validated_data["user"]
        recorded_at = validated_data["recorded_at"]
        obj, _ = WeightLog.objects.update_or_create(
            user=user, recorded_at=recorded_at, defaults={"weight_kg": validated_data["weight_kg"]}
        )
        return obj


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
