from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import FileExtensionValidator
from django.db import models

ALLOWED_MEDIA_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp", "mp4", "mov", "webm"]


class Move(models.Model):
    """A single exercise (e.g. 'Bench Press') trainers/admins can attach to
    warmups, workout days, daily items, or just keep as a reference in the
    move library."""

    class Category(models.TextChoices):
        CHEST = "chest", "Chest"
        BACK = "back", "Back"
        LEGS = "legs", "Legs"
        SHOULDERS = "shoulders", "Shoulders"
        ARMS = "arms", "Arms"
        CORE = "core", "Core"
        CARDIO = "cardio", "Cardio"
        FULL_BODY = "full_body", "Full Body"
        OTHER = "other", "Other"

    class Difficulty(models.TextChoices):
        BEGINNER = "beginner", "Beginner"
        INTERMEDIATE = "intermediate", "Intermediate"
        ADVANCED = "advanced", "Advanced"

    name = models.CharField(max_length=100)
    alias = models.CharField(max_length=100, blank=True, null=True)
    description = models.TextField(blank=True, null=True)
    category = models.CharField(max_length=20, choices=Category.choices, blank=True)
    difficulty = models.CharField(max_length=20, choices=Difficulty.choices, blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="moves_created",
        on_delete=models.SET_NULL,
        null=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class MoveMedia(models.Model):
    """One image or video demonstrating a move. A move can have several
    (e.g. 3 form-check photos + 1 video), ordered for display.

    Videos can either be uploaded directly (`file`) or linked externally
    (`external_url` — e.g. an unlisted YouTube/Vimeo link). Uploading is
    fine for images, but for video, linking externally is usually the
    better call: it avoids hosting/transcoding large files yourself.
    """

    class MediaType(models.TextChoices):
        IMAGE = "image", "Image"
        VIDEO = "video", "Video"

    move = models.ForeignKey(Move, related_name="media", on_delete=models.CASCADE)
    media_type = models.CharField(max_length=10, choices=MediaType.choices)
    file = models.FileField(
        upload_to="moves/",
        null=True,
        blank=True,
        validators=[FileExtensionValidator(allowed_extensions=ALLOWED_MEDIA_EXTENSIONS)],
    )
    external_url = models.URLField(blank=True)
    caption = models.CharField(max_length=255, blank=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]
        verbose_name_plural = "Move media"

    def __str__(self):
        return f"{self.move.name} — {self.get_media_type_display()} #{self.order}"

    def clean(self):
        if not self.file and not self.external_url:
            raise ValidationError("Provide either an uploaded file or an external_url.")
        if self.file and self.external_url:
            raise ValidationError("Provide only one of file or external_url, not both.")
