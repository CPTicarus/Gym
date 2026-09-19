from django.urls import path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    BodyMeasurementViewSet,
    BodyPhotoExampleViewSet,
    BodyPhotoFileView,
    BodyPhotoViewSet,
    CustomTokenObtainPairView,
    HealthConditionViewSet,
    MeView,
    RegisterView,
    StaffCreateView,
    UserViewSet,
)

router = DefaultRouter()
router.register("users", UserViewSet, basename="user")
router.register("me/measurements", BodyMeasurementViewSet, basename="measurement")
router.register("me/health-conditions", HealthConditionViewSet, basename="health-condition")
router.register("me/body-photos", BodyPhotoViewSet, basename="body-photo")
# Gym-wide "here is what a good shot looks like" — readable by any member,
# writable by trainers and admins.
router.register("body-photo-examples", BodyPhotoExampleViewSet, basename="body-photo-example")

urlpatterns = [
    path("auth/register/", RegisterView.as_view(), name="auth-register"),
    path("auth/login/", CustomTokenObtainPairView.as_view(), name="auth-login"),
    path("auth/refresh/", TokenRefreshView.as_view(), name="auth-refresh"),
    path("auth/me/", MeView.as_view(), name="auth-me"),
    path("auth/staff/", StaffCreateView.as_view(), name="auth-staff-create"),
    # The only route that reads a body photo back — see BodyPhotoFileView.
    path("body-photos/<int:pk>/file/", BodyPhotoFileView.as_view(), name="body-photo-file"),
] + router.urls
