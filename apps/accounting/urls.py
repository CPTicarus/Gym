from rest_framework.routers import DefaultRouter

from .views import MemberAccountingViewSet

router = DefaultRouter()
router.register("accounting/members", MemberAccountingViewSet, basename="accounting-member")

urlpatterns = router.urls
