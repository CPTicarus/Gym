from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

from apps.branding.backups import BackupDownloadTicketView, BackupDownloadView, BackupListView
from apps.branding.system_resources import SystemResourcesView
from apps.branding.views import BrandingView, ChatMediaSettingsView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/config/branding/", BrandingView.as_view(), name="gym-branding"),
    path("api/config/chat-media/", ChatMediaSettingsView.as_view(), name="gym-chat-media"),
    path("api/config/system-resources/", SystemResourcesView.as_view(), name="gym-system-resources"),
    path("api/config/backups/", BackupListView.as_view(), name="gym-backups"),
    path("api/config/backups/<str:kind>/download-ticket/", BackupDownloadTicketView.as_view(), name="gym-backup-ticket"),
    path("api/config/backups/<str:kind>/download/", BackupDownloadView.as_view(), name="gym-backup-download"),
    path("api/chat/", include("apps.chat.urls")),
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
