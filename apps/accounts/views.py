from django.contrib.auth import get_user_model
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import generics, permissions, viewsets
from rest_framework.filters import SearchFilter
from rest_framework_simplejwt.views import TokenObtainPairView

from .permissions import IsAdmin, IsStaff
from .serializers import (
    CustomTokenObtainPairSerializer,
    MeSerializer,
    RegisterSerializer,
    StaffCreateSerializer,
    UserSerializer,
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


class UserViewSet(viewsets.ReadOnlyModelViewSet):
    """
    The staff dashboard's user directory — every staff role can reach this,
    but sees a different slice of it:
      - admin: every user, any role
      - trainer / accounting: members only (their clients / billing scope)

      GET /api/users/?role=trainer   meaningful for admin; others are already scoped to members
      GET /api/users/?search=jane
    """

    serializer_class = UserSerializer
    permission_classes = [IsStaff]
    filter_backends = [DjangoFilterBackend, SearchFilter]
    filterset_fields = ["role"]
    search_fields = ["username", "email", "first_name", "last_name", "phone_number"]

    def get_queryset(self):
        user = self.request.user
        if user.is_gym_admin:
            return User.objects.all()
        return User.objects.filter(role=User.Role.MEMBER)
