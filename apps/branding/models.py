from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


MAX_CHAT_MEDIA_SIZE_MB = 100
MAX_CHAT_MEDIA_RETENTION_DAYS = 36500


class GymBranding(models.Model):
    """Gym-wide settings and administrator overrides for the bundled branding."""

    overrides = models.JSONField(default=dict)
    chat_media_max_size_mb = models.PositiveIntegerField(
        default=25, validators=[MinValueValidator(1), MaxValueValidator(MAX_CHAT_MEDIA_SIZE_MB)],
    )
    chat_media_retention_days = models.PositiveIntegerField(
        default=30, null=True, blank=True,
        validators=[MinValueValidator(1), MaxValueValidator(MAX_CHAT_MEDIA_RETENTION_DAYS)],
    )

    @classmethod
    def current(cls):
        return cls.objects.filter(pk=1).first() or cls()

    @property
    def chat_media(self):
        return {
            "chat_media_max_size_mb": self.chat_media_max_size_mb,
            "chat_media_retention_days": self.chat_media_retention_days,
        }

    @classmethod
    def chat_media_settings(cls):
        return cls.current().chat_media


class BackupDownloadTicket(models.Model):
    digest = models.CharField(primary_key=True, max_length=64, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    kind = models.CharField(max_length=8)
    file_name = models.CharField(max_length=64)
    expires_at = models.DateTimeField(db_index=True)
