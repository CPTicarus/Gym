from django.db import transaction
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import generics, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.filters import SearchFilter
from rest_framework.generics import get_object_or_404
from rest_framework.response import Response

from apps.accounts.permissions import IsStaff, IsTrainerOrAdmin
from apps.plan_copy import copy_name

from .models import SupplementAssignment, SupplementItem, SupplementPlan
from .serializers import (
    SupplementAssignmentListSerializer,
    SupplementAssignmentSerializer,
    SupplementItemSerializer,
    SupplementPlanListSerializer,
    SupplementPlanSerializer,
)


class SupplementPlanViewSet(viewsets.ModelViewSet):
    """
    Trainer/admin-only management of supplement protocols. Members never
    hit this directly — they read their own via /api/my-supplement-plans/.

      GET/POST         /api/supplement-plans/
      GET/PATCH/DELETE /api/supplement-plans/{id}/
      POST             /api/supplement-plans/{id}/assign/      {"user": <member_id>}
      POST             /api/supplement-plans/{id}/duplicate/   {"name": "..."} (optional)
    """

    queryset = SupplementPlan.objects.all().select_related("created_by").prefetch_related("items")
    permission_classes = [IsTrainerOrAdmin]
    filter_backends = [DjangoFilterBackend, SearchFilter]
    filterset_fields = ["goal"]
    # Searching item names too, since "who is on creatine?" is a more
    # natural question here than the protocol's own title.
    search_fields = ["name", "description", "items__name"]

    def get_serializer_class(self):
        return SupplementPlanListSerializer if self.action == "list" else SupplementPlanSerializer

    def get_queryset(self):
        # Searching across a reverse relation multiplies rows; distinct()
        # keeps a protocol from appearing once per matching item.
        return super().get_queryset().distinct()

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=["post"], url_path="duplicate")
    def duplicate(self, request, pk=None):
        """Copy a protocol and its items into a new one.

        Assignments are deliberately NOT copied: a duplicate exists to be
        varied before anyone gets it, and silently handing the original's
        members an untouched clone is the opposite of that. `created_by`
        becomes whoever pressed the button, since they own the copy.

        Atomic — a half-copied protocol is worse than none, because it
        looks complete.
        """
        source = self.get_object()
        with transaction.atomic():
            copy = SupplementPlan.objects.create(
                name=copy_name(source.name, request.data.get("name")),
                description=source.description,
                goal=source.goal,
                created_by=request.user,
            )
            SupplementItem.objects.bulk_create(
                SupplementItem(
                    plan=copy,
                    name=item.name,
                    dosage=item.dosage,
                    timing=item.timing,
                    frequency=item.frequency,
                    notes=item.notes,
                    order=item.order,
                )
                for item in source.items.all()
            )
        serializer = SupplementPlanSerializer(copy, context=self.get_serializer_context())
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="assign")
    def assign(self, request, pk=None):
        plan = self.get_object()
        serializer = SupplementAssignmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # One active protocol per member (SupplementAssignment.save
        # enforces it) — captured here so the response can name the one it
        # archived, rather than a protocol silently disappearing.
        replaced = (
            SupplementAssignment.objects.filter(
                user=serializer.validated_data["user"], status=SupplementAssignment.Status.ACTIVE
            )
            .select_related("plan")
            .first()
        )

        serializer.save(plan=plan, assigned_by=request.user)
        data = dict(serializer.data)
        data["previous_plan_archived"] = replaced.plan.name if replaced else None
        return Response(data, status=status.HTTP_201_CREATED)


class SupplementItemViewSet(viewsets.ModelViewSet):
    """Items nested under a protocol:
    /api/supplement-plans/{plan_pk}/items/"""

    serializer_class = SupplementItemSerializer
    permission_classes = [IsTrainerOrAdmin]

    def get_queryset(self):
        return SupplementItem.objects.filter(plan_id=self.kwargs["plan_pk"])

    def perform_create(self, serializer):
        plan = get_object_or_404(SupplementPlan, pk=self.kwargs["plan_pk"])
        serializer.save(plan=plan)


class SupplementAssignmentViewSet(viewsets.ModelViewSet):
    """Staff view of who is on which protocol — mirrors the workout and
    diet assignment endpoints.

      GET    /api/supplement-assignments/?plan=3
      GET    /api/supplement-assignments/?user=12
      PATCH  /api/supplement-assignments/{id}/   {"status": "completed"}
      DELETE /api/supplement-assignments/{id}/   unassign
    """

    queryset = SupplementAssignment.objects.all().select_related("plan", "user", "assigned_by")
    serializer_class = SupplementAssignmentListSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["plan", "user", "status"]
    http_method_names = ["get", "patch", "delete", "head", "options"]

    def get_permissions(self):
        if self.request.method in ("PATCH", "DELETE"):
            return [IsTrainerOrAdmin()]
        return [IsStaff()]


class MySupplementPlansView(generics.ListAPIView):
    """A member's own protocols, full detail.

    An empty list is the expected answer for most members rather than a
    gap to fill — a supplement protocol is something only a few people
    are given.

      GET /api/my-supplement-plans/
      GET /api/my-supplement-plans/?status=active
    """

    serializer_class = SupplementAssignmentSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["status"]

    def get_queryset(self):
        return (
            SupplementAssignment.objects.filter(user=self.request.user)
            .select_related("plan", "assigned_by")
            .prefetch_related("plan__items")
        )
