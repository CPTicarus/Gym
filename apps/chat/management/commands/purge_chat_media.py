from datetime import timedelta

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.branding.models import GymBranding
from apps.chat.models import ChatAttachment, delete_private_file

BATCH_SIZE = 100


class Command(BaseCommand):
    help = "Delete expired private chat files while keeping messages and attachment metadata."

    def handle(self, *args, **options):
        removed = failed = last_id = 0
        while True:
            with transaction.atomic():
                settings, _ = GymBranding.objects.select_for_update().get_or_create(pk=1)
                days = settings.chat_media_retention_days
                if days is None:
                    break
                now = timezone.now()
                attachments = list(ChatAttachment.objects.filter(
                    pk__gt=last_id, deleted_at__isnull=True,
                    message__created_at__lte=now - timedelta(days=days),
                ).exclude(file="").order_by("pk")[:BATCH_SIZE])
                if not attachments:
                    break

                deleted = []
                for attachment in attachments:
                    if delete_private_file(attachment.file.storage, attachment.file.name):
                        attachment.file = ""
                        attachment.deleted_at = now
                        deleted.append(attachment)
                    else:
                        failed += 1
                ChatAttachment.objects.bulk_update(deleted, ["file", "deleted_at"])
                last_id = attachments[-1].pk
                removed += len(deleted)

        if failed:
            raise CommandError(f"Removed {removed} chat attachment(s). Could not remove {failed} file(s).")
        if options["verbosity"]:
            self.stdout.write(f"Removed {removed} expired chat attachment(s).")
