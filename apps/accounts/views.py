from django.contrib.auth import get_user_model
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import generics, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.filters import SearchFilter
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import WeightLog
from .permissions import CanManageUser, IsAdmin, IsAdminOrAccounting, IsStaff
from .throttling import LoginRateThrottle
from .serializers import (
    CustomTokenObtainPairSerializer,
    MemberEditSerializer,
    MeSerializer,
    RegisterSerializer,
    SetPasswordSerializer,
    StaffCreateSerializer,
    UserAdminSerializer,
    UserCreateSerializer,
    UserSerializer,
    WeightLogSerializer,
)

User = get_user_model()


class CustomTokenObtainPairView(TokenObtainPairView):
    """POST {username, password} -> {access, refresh}, with role baked into the token.

    Rate-limited per account. This is not optional decoration: member
    passwords are deliberately allowed to be short (a 4-digit PIN — see
    apps/accounts/passwords.py), and a short password is only as safe as
    the number of guesses an attacker gets. The limit turns 10,000
    combinations from seconds of scripted traffic into most of a day.
    See LoginRateThrottle for why it counts per username, not per IP.
    """

    serializer_class = CustomTokenObtainPairSerializer
    throttle_classes = [LoginRateThrottle]


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
      UPDATE admin: full profile, role, membership, active flag — for
             anyone except another admin (themselves included, so an admin
             can still edit their own record)
             accounting: members only, everything but role and active flag
             (see MemberEditSerializer)
             trainer: not allowed — read-only
             The per-object half of that lives in can_manage_user.

      POST /api/users/{id}/set-password/   {"password": "..."} — same rule
             as UPDATE. Sets a new password; nobody can read the existing
             one, here or anywhere else (it's a one-way hash).

      GET /api/users/?role=trainer   meaningful for admin; others are already scoped to members
      GET /api/users/?search=jane

    Deliberately no DELETE: removing a user would cascade into their workout
    and diet assignments and lose history. Deactivate via `is_active` instead.
    """

    permission_classes = [IsStaff]
    filter_backends = [DjangoFilterBackend, SearchFilter]
    filterset_fields = ["role", "is_active"]
    search_fields = [
        "username", "national_id", "email", "first_name", "last_name", "phone_number",
    ]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        user = self.request.user
        if user.is_gym_admin:
            return User.objects.all()
        return User.objects.filter(role=User.Role.MEMBER)

    def get_permissions(self):
        if self.action in ("create", "partial_update", "update", "set_password"):
            # IsAdminOrAccounting is the coarse gate (who may write at all);
            # CanManageUser is the per-record one (whose record they may
            # touch), and only the second can see the target.
            return [IsAdminOrAccounting(), CanManageUser()]
        return [IsStaff()]

    def get_serializer_class(self):
        if self.action == "create":
            return UserCreateSerializer
        if self.action in ("partial_update", "update"):
            # Admin edits everything including role; accounting edits a
            # member's details but can't touch role or the active flag.
            return UserAdminSerializer if self.request.user.is_gym_admin else MemberEditSerializer
        return UserSerializer

    def perform_create(self, serializer):
        """Accounting runs the front desk, so it can sign up members — but
        handing out trainer or admin accounts is the admin's call alone.
        Enforced here rather than in the serializer, since it's a question
        about the requester, not about the data."""
        role = serializer.validated_data.get("role", User.Role.MEMBER)
        if role != User.Role.MEMBER and not self.request.user.is_gym_admin:
            raise PermissionDenied("Only admins can create staff accounts.")
        serializer.save()

    @action(detail=True, methods=["post"], url_path="set-password")
    def set_password(self, request, pk=None):
        """Give someone a new password.

        Deliberately a set, not a reveal. Django stores passwords as a
        one-way hash, so the current one cannot be shown to staff, to an
        admin, or to anyone else — it can only be replaced. What the front
        desk needs (getting a locked-out member back in) this covers; the
        new value is the one the caller just supplied, so the person who
        set it already knows what to tell them.
        """
        target = self.get_object()  # runs CanManageUser against this record
        serializer = SetPasswordSerializer(
            data=request.data, context={"request": request, "target": target}
        )
        serializer.is_valid(raise_exception=True)
        target.set_password(serializer.validated_data["password"])
        target.save(update_fields=["password"])
        return Response(status=status.HTTP_204_NO_CONTENT)


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
