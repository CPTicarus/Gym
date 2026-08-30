from django.contrib.auth import get_user_model
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import viewsets
from rest_framework.filters import OrderingFilter, SearchFilter

from apps.accounts.permissions import IsAdminOrAccounting

from .serializers import MemberAccountingSerializer

User = get_user_model()


class MemberAccountingViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read-only directory of members with full profile info and membership
    status — the "Accounting" page in the dashboard nav, reachable by
    admin as well as accounting staff.

      GET /api/accounting/members/
      GET /api/accounting/members/?search=jane
      GET /api/accounting/members/?ordering=membership_end_date   soonest-expiring first
      GET /api/accounting/members/{id}/
    """

    queryset = User.objects.filter(role=User.Role.MEMBER)
    serializer_class = MemberAccountingSerializer
    permission_classes = [IsAdminOrAccounting]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["is_active"]
    search_fields = ["username", "email", "first_name", "last_name", "phone_number"]
    ordering_fields = ["membership_end_date", "membership_start_date", "created_at", "username"]
    ordering = ["membership_end_date"]
