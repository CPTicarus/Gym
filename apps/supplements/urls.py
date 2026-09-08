from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    MySupplementPlansView,
    SupplementAssignmentViewSet,
    SupplementItemViewSet,
    SupplementPlanViewSet,
)

router = DefaultRouter()
router.register("supplement-plans", SupplementPlanViewSet, basename="supplement-plan")
router.register(
    "supplement-assignments", SupplementAssignmentViewSet, basename="supplement-assignment"
)
# the router also generates POST /supplement-plans/{id}/assign/ from the @action

item_list = SupplementItemViewSet.as_view({"get": "list", "post": "create"})
item_detail = SupplementItemViewSet.as_view(
    {"get": "retrieve", "patch": "partial_update", "put": "update", "delete": "destroy"}
)

urlpatterns = router.urls + [
    path("supplement-plans/<int:plan_pk>/items/", item_list, name="supplement-item-list"),
    path(
        "supplement-plans/<int:plan_pk>/items/<int:pk>/", item_detail, name="supplement-item-detail"
    ),
    # Member-facing
    path("my-supplement-plans/", MySupplementPlansView.as_view(), name="my-supplement-plans"),
]
