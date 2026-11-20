from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

from apps.branding.views import BrandingView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/config/branding/", BrandingView.as_view(), name="gym-branding"),
    path("api/", include("apps.accounts.urls")),
    path("api/", include("apps.moves.urls")),
    path("api/", include("apps.workouts.urls")),
    path("api/", include("apps.diet.urls")),
    path("api/", include("apps.accounting.urls")),
    path("api/", include("apps.blog.urls")),
    path("api/", include("apps.supplements.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
