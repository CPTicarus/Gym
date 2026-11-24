import logging
import uuid
from datetime import timedelta

from django.conf import settings
from django.db import models, transaction
from django.db.models.signals import post_delete
from django.dispatch import receiver

from apps.accounts.models import get_private_media_storage
from apps.branding.models import MAX_CHAT_MEDIA_SIZE_MB

BYTES_PER_MB = 1024 * 1024
MAX_CHAT_ATTACHMENT_BYTES = MAX_CHAT_MEDIA_SIZE_MB * BYTES_PER_MB
MAX_ATTACHMENTS_PER_MESSAGE = 10
MAX_MESSAGE_LENGTH = 5000

logger = logging.getLogger(__name__)


def attachment_path(instance, filename):
    return f"chat/{uuid.uuid4().hex}"


def attachment_deadline(created_at, retention_days):
    if retention_days is not None:
        return created_at + timedelta(days=retention_days)
    return None


def delete_private_file(storage, name):
    try:
        storage.delete(name)
    except OSError:
        logger.exception("Could not delete chat attachment %s", name)
        return False
    return True


class ChatMessage(models.Model):
    member = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="member_chat_messages"
    )
    trainer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="trainer_chat_messages"
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="sent_chat_messages"
    )
    text = models.TextField(blank=True, max_length=MAX_MESSAGE_LENGTH)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        indexes = [models.Index(fields=["member", "trainer", "id"], name="chat_message_thread_idx")]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(sender=models.F("member")) | models.Q(sender=models.F("trainer")),
                name="chat_message_sender_is_participant",
            ),
        ]


class ChatReadState(models.Model):
    member = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="member_chat_read_states"
    )
    trainer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="trainer_chat_read_states"
    )
    member_read_through = models.PositiveBigIntegerField(default=0)
    trainer_read_through = models.PositiveBigIntegerField(default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["member", "trainer"], name="chat_read_state_per_thread"),
        ]


class ChatAttachment(models.Model):
    message = models.ForeignKey(ChatMessage, on_delete=models.CASCADE, related_name="attachments")
    file = models.FileField(upload_to=attachment_path, storage=get_private_media_storage, blank=True)
    name = models.CharField(max_length=255)
    content_type = models.CharField(max_length=127)
    size = models.PositiveIntegerField()
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["id"]

    def is_expired(self, retention_days, now):
        deadline = attachment_deadline(self.message.created_at, retention_days)
        return not self.file or (deadline is not None and now >= deadline)


@receiver(post_delete, sender=ChatAttachment)
def delete_chat_attachment(sender, instance, using, **kwargs):
    if instance.file:
        # Keep the file in place if a user/message deletion rolls back.
        file = instance.file
        transaction.on_commit(lambda: delete_private_file(file.storage, file.name), using=using)
