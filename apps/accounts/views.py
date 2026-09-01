from django.contrib.auth import get_user_model
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import generics, permissions, viewsets
from rest_framework.filters import SearchFilter
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import WeightLog
from .permissions import IsAdmin, IsAdminOrAccounting, IsStaff
from .serializers import (
    CustomTokenObtainPairSerializer,
    MemberCreateSerializer,
    MembershipUpdateSerializer,
    MeSerializer,
    RegisterSerializer,
    StaffCreateSerializer,
    UserAdminSerializer,
    UserSerializer,
    WeightLogSerializer,
)

User = get_user_model()


class CustomTokenObtainPairView(TokenObtainPairView):
    """POST {username, password} -> {access, refresh}, with role baked into the token."""

    serializer_class = CustomTokenObtainPairSerializer


class RegisterView(generics.CreateAPIView):
    """Public self-registration — always creates a MEMBER account."""

    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]


class StaffCreateView(generics.CreateAPIView):
    """Admin-only: create trainer / admin / accounting accounts."""

    queryset = User.objects.all()
    serializer_class = StaffCreateSerializer
    permission_classes = [IsAdmin]


class MeView(generics.RetrieveUpdateAPIView):
    """GET/PATCH the logged-in user's own profile."""

    serializer_class = MeSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user


class UserViewSet(viewsets.ModelViewSet):
    """
    The staff dashboard's user directory. Every staff role can reach it,
    but sees and can do different things:

      READ   admin: every user, any role
             trainer / accounting: members only (their clients / billing scope)
      CREATE admin, accounting — front-desk member intake (always creates a
             MEMBER; staff accounts go through POST /auth/staff/ instead)
      UPDATE admin: full profile, role, membership, active flag
             accounting: membership dates only (see MembershipUpdateSerializer)
             trainer: not allowed — read-only

      GET /api/users/?role=trainer   meaningful for admin; others are already scoped to members
      GET /api/users/?search=jane

    Deliberately no DELETE: removing a user would cascade into their workout
    and diet assignments and lose history. Deactivate via `is_active` instead.
    """

    permission_classes = [IsStaff]
    filter_backends = [DjangoFilterBackend, SearchFilter]
    filterset_fields = ["role", "is_active"]
    search_fields = ["username", "email", "first_name", "last_name", "phone_number"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        user = self.request.user
        if user.is_gym_admin:
            return User.objects.all()
        return User.objects.filter(role=User.Role.MEMBER)

    def get_permissions(self):
        if self.action in ("create", "partial_update", "update"):
            return [IsAdminOrAccounting()]
        return [IsStaff()]

    def get_serializer_class(self):
        if self.action == "create":
            return MemberCreateSerializer
        if self.action in ("partial_update", "update"):
            # Accounting gets the narrow membership-only serializer, so it
            # can renew someone without being able to edit profiles or roles.
            return UserAdminSerializer if self.request.user.is_gym_admin else MembershipUpdateSerializer
        return UserSerializer


class WeightLogViewSet(viewsets.ModelViewSet):
    """A member's own weight-tracking log — self-service only, so weight
    always reflects what the person themselves reported.

      GET    /api/me/weight-logs/            (most recent first)
      POST   /api/me/weight-logs/             {"weight_kg": 82.5, "recorded_at": "2026-09-01"}
      PATCH  /api/me/weight-logs/{id}/
      DELETE /api/me/weight-logs/{id}/
    """

    serializer_class = WeightLogSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return WeightLog.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)
