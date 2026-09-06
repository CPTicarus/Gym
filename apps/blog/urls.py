from rest_framework.routers import DefaultRouter

from .views import PostViewSet

router = DefaultRouter()
router.register("blog-posts", PostViewSet, basename="blog-post")

urlpatterns = router.urls
