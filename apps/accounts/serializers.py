from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    """General-purpose read serializer — e.g. admin's user directory,
    or a member looking up a trainer's basic info."""

    is_membership_active = serializers.BooleanField(read_only=True)

    class Meta:
        model = User
        fields = [
            "id", "username", "email", "first_name", "last_name",
            "role", "phone_number", "date_of_birth", "gender",
            "profile_picture", "membership_start_date", "membership_end_date",
            "is_membership_active", "created_at",
        ]
        read_only_fields = ["id", "role", "created_at", "is_membership_active"]


class UserAdminSerializer(serializers.ModelSerializer):
    """Admin's full edit view of another user — profile, role, membership
    window, and active flag. Password is deliberately absent: resetting
    someone else's password is a separate concern with its own risks, not
    something to fold into a general profile PATCH."""

    is_membership_active = serializers.BooleanField(read_only=True)

    class Meta:
        model = User
        fields = [
            "id", "username", "email", "first_name", "last_name",
            "role", "phone_number", "date_of_birth", "gender",
            "profile_picture", "membership_start_date", "membership_end_date",
            "is_membership_active", "is_active", "created_at",
        ]
        read_only_fields = ["id", "username", "created_at", "is_membership_active"]


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


class MemberCreateSerializer(serializers.ModelSerializer):
    """Staff-side member intake — creating an account on someone's behalf
    at the front desk, with their membership window set at the same time.
    Always creates a MEMBER; staff accounts still go through
    StaffCreateSerializer."""

    password = serializers.CharField(write_only=True, validators=[validate_password])

    class Meta:
        model = User
        fields = [
            "id", "username", "email", "password", "first_name", "last_name",
            "phone_number", "date_of_birth", "gender",
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
        return attrs

    def create(self, validated_data):
        validated_data["role"] = User.Role.MEMBER
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class RegisterSerializer(serializers.ModelSerializer):
    """Public self sign-up. Always creates a MEMBER — trainer/admin/accounting
    accounts are created by an admin via StaffCreateSerializer instead."""

    password = serializers.CharField(write_only=True, validators=[validate_password])
    password_confirm = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = [
            "username", "email", "password", "password_confirm",
            "first_name", "last_name", "phone_number",
        ]

    def validate(self, attrs):
        if attrs["password"] != attrs.pop("password_confirm"):
            raise serializers.ValidationError({"password_confirm": "Passwords do not match."})
        return attrs

    def create(self, validated_data):
        validated_data["role"] = User.Role.MEMBER
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class StaffCreateSerializer(serializers.ModelSerializer):
    """Admin-only: create trainer / admin / accounting accounts."""

    password = serializers.CharField(write_only=True, validators=[validate_password])

    class Meta:
        model = User
        fields = [
            "username", "email", "password", "first_name", "last_name",
            "phone_number", "role",
        ]

    def validate_role(self, value):
        if value == User.Role.MEMBER:
            raise serializers.ValidationError(
                "Use the public registration endpoint to create member accounts."
            )
        return value

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class MeSerializer(serializers.ModelSerializer):
    """What a logged-in user sees/edits about themselves. Role and membership
    dates are read-only here — those only change via admin/accounting actions."""

    is_membership_active = serializers.BooleanField(read_only=True)

    class Meta:
        model = User
        fields = [
            "id", "username", "email", "first_name", "last_name",
            "role", "phone_number", "date_of_birth", "gender",
            "profile_picture", "membership_start_date", "membership_end_date",
            "is_membership_active",
        ]
        read_only_fields = [
            "id", "username", "role",
            "membership_start_date", "membership_end_date", "is_membership_active",
        ]


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
