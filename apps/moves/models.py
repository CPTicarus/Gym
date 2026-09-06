import re

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import FileExtensionValidator
from django.db import models
from django.db.models.signals import post_delete
from django.dispatch import receiver

ALLOWED_MEDIA_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp", "mp4", "mov", "webm"]

_EXTENSION_RE = re.compile(r"\.([a-z0-9]+)$")

_BYTES_PER_MB = 1024 * 1024


def media_size_limits():
    """Per-media-type upload caps, in bytes, read from settings at call
    time so a gym's .env override applies without a restart-time bake-in
    (and without a migration — see validate_media_size)."""
    return {
        media_type: {
            "warn_bytes": int(caps["warn"] * _BYTES_PER_MB),
            "max_bytes": int(caps["max"] * _BYTES_PER_MB),
        }
        for media_type, caps in settings.MEDIA_SIZE_LIMITS_MB.items()
    }


def validate_media_size(value):
    """Refuse an upload over the hard cap for its media type.

    Lives on the model field rather than in the serializer for two
    reasons: it then covers the Django admin as well, and DRF copies
    model-field validators onto the serializer field, so the API is
    covered by the same one line.

    Only the hard cap is enforced here. The soft one is a warning, and a
    warning is only useful *before* the upload — by the time these bytes
    have reached the server, the cost it exists to avoid has already been
    paid. So warning is the frontend's job (it has the file locally, and
    reads the same numbers from /api/moves/media-limits/).
    """
    limits = media_size_limits().get(MoveMedia.detect_media_type(value.name))
    if limits and value.size > limits["max_bytes"]:
        raise ValidationError(
            "File is too large (%(size).1f MB). The limit is %(max).1f MB."
            % {"size": value.size / _BYTES_PER_MB, "max": limits["max_bytes"] / _BYTES_PER_MB}
        )


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
        GIF = "gif", "GIF"
        VIDEO = "video", "Video"

    # What each extension is, so nobody has to tell us (see save()). GIF is
    # split out from IMAGE purely for labelling — it renders in an <img>
    # like any other image, but someone scanning a move's media wants to
    # see at a glance which entry is the animated loop.
    EXTENSION_MEDIA_TYPES = {
        "jpg": MediaType.IMAGE,
        "jpeg": MediaType.IMAGE,
        "png": MediaType.IMAGE,
        "webp": MediaType.IMAGE,
        "gif": MediaType.GIF,
        "mp4": MediaType.VIDEO,
        "mov": MediaType.VIDEO,
        "webm": MediaType.VIDEO,
    }

    move = models.ForeignKey(Move, related_name="media", on_delete=models.CASCADE)
    # Derived on save, never asked for — hence blank, so the Django admin
    # doesn't demand it either.
    media_type = models.CharField(max_length=10, choices=MediaType.choices, blank=True)
    file = models.FileField(
        upload_to="moves/",
        null=True,
        blank=True,
        validators=[
            FileExtensionValidator(allowed_extensions=ALLOWED_MEDIA_EXTENSIONS),
            validate_media_size,
        ],
    )
    external_url = models.URLField(blank=True)
    caption = models.CharField(max_length=255, blank=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]
        verbose_name_plural = "Move media"

    def __str__(self):
        return f"{self.move.name} — {self.get_media_type_display()} #{self.order}"

    @classmethod
    def detect_media_type(cls, name):
        """The media type a filename or URL implies, or None when it has no
        extension we recognise (a YouTube watch link, say)."""
        path = str(name or "").split("?")[0].split("#")[0].lower()
        match = _EXTENSION_RE.search(path)
        return cls.EXTENSION_MEDIA_TYPES.get(match.group(1)) if match else None

    def save(self, *args, **kwargs):
        # The upload's own extension is the authority on what it is; asking
        # the uploader to pick a type as well only invites the two to
        # disagree. In the model rather than the serializer so the Django
        # admin and any future import script behave the same way. A link
        # with no usable extension falls back to video — that's what
        # linking out is for here (see the class docstring).
        detected = self.detect_media_type(self.file.name if self.file else self.external_url)
        self.media_type = detected or self.media_type or self.MediaType.VIDEO
        super().save(*args, **kwargs)

    def clean(self):
        if not self.file and not self.external_url:
            raise ValidationError("Provide either an uploaded file or an external_url.")
        if self.file and self.external_url:
            raise ValidationError("Provide only one of file or external_url, not both.")


@receiver(post_delete, sender=MoveMedia)
def delete_media_file(sender, instance, **kwargs):
    """Drop the uploaded blob when its row goes.

    Django deletes the row, not the file — which would leave orphans piling
    up in MEDIA_ROOT and quietly defeat the size caps this app now enforces.
    A post_delete receiver rather than an override of delete() so it also
    fires for cascades (deleting a Move takes its media with it) and for
    queryset deletes.

    save=False because the row is already gone; there's nothing to write
    the cleared field back to.
    """
    if instance.file:
        instance.file.delete(save=False)
