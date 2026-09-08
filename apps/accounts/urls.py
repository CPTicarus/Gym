from django.urls import path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    BodyMeasurementViewSet,
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

urlpatterns = [
    path("auth/register/", RegisterView.as_view(), name="auth-register"),
    path("auth/login/", CustomTokenObtainPairView.as_view(), name="auth-login"),
    path("auth/refresh/", TokenRefreshView.as_view(), name="auth-refresh"),
    path("auth/me/", MeView.as_view(), name="auth-me"),
    path("auth/staff/", StaffCreateView.as_view(), name="auth-staff-create"),
] + router.urls
