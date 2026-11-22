from django_filters import FilterSet, NumberFilter
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import serializers, viewsets

from apps.accounts.permissions import IsStaff, IsTrainerOrAdmin, visible_members


class AssignableMemberField(serializers.PrimaryKeyRelatedField):
    def get_queryset(self):
        request = self.context.get("request")
        return visible_members(request.user if request else None)


class PlanAssignmentFilterSet(FilterSet):
    # Filter by ID without enumerating accounts in the filter form or
    # validating the ID against members outside the viewer's scope.
    user = NumberFilter(field_name="user_id")


class PlanAssignmentFilterBackend(DjangoFilterBackend):
    filterset_base = PlanAssignmentFilterSet


class StaffPlanAssignmentViewSet(viewsets.ModelViewSet):
    filter_backends = [PlanAssignmentFilterBackend]
    filterset_fields = ["plan", "user", "status"]
    http_method_names = ["get", "patch", "delete", "head", "options"]

    def get_queryset(self):
        queryset = super().get_queryset()
        if getattr(self.request.user, "is_trainer", False):
            return queryset.filter(user__in=visible_members(self.request.user))
        return queryset

    def get_permissions(self):
        if self.request.method in ("PATCH", "DELETE"):
            return [IsTrainerOrAdmin()]
        return [IsStaff()]
