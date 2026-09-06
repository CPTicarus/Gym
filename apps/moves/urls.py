from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import MoveMediaViewSet, MoveViewSet

router = DefaultRouter()
router.register("moves", MoveViewSet, basename="move")

move_media_list = MoveMediaViewSet.as_view({"get": "list", "post": "create"})
move_media_detail = MoveMediaViewSet.as_view(
    {"get": "retrieve", "patch": "partial_update", "put": "update", "delete": "destroy"}
)
move_media_reorder = MoveMediaViewSet.as_view({"post": "reorder"})

urlpatterns = router.urls + [
    # nested manually (no drf-nested-routers dependency needed for one level)
    path("moves/<int:move_pk>/media/", move_media_list, name="move-media-list"),
    # Before the <int:pk> detail route only for readability — "reorder" is
    # not an int, so the two can't collide either way.
    path("moves/<int:move_pk>/media/reorder/", move_media_reorder, name="move-media-reorder"),
    path("moves/<int:move_pk>/media/<int:pk>/", move_media_detail, name="move-media-detail"),
]
