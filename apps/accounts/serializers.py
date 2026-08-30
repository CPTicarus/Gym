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
