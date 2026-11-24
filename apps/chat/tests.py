from datetime import timedelta
from io import BytesIO
from tempfile import TemporaryDirectory
from unittest import skipUnless
from unittest.mock import patch

from django.core.files.storage import FileSystemStorage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.urls import reverse
from django.utils import timezone
from PIL import Image
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.branding.models import GymBranding

from .media_types import file_command
from .models import BYTES_PER_MB, ChatAttachment, ChatMessage


def photo_bytes():
    image = BytesIO()
    Image.new("RGB", (2, 2)).save(image, format="PNG")
    return image.getvalue()


class ChatTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.trainer = User.objects.create(username="trainer", national_id="0000000001", role=User.Role.TRAINER)
        cls.member = User.objects.create(username="member", national_id="0000000002", trainer=cls.trainer)
        cls.other_trainer = User.objects.create(username="trainer2", national_id="0000000003", role=User.Role.TRAINER)
        cls.other_member = User.objects.create(username="member2", national_id="0000000004", trainer=cls.trainer)
        cls.admin = User.objects.create(username="admin", national_id="0000000005", role=User.Role.ADMIN)

    def setUp(self):
        directory = self.enterContext(TemporaryDirectory())
        self.storage = FileSystemStorage(location=directory)
        self.enterContext(patch.object(ChatAttachment._meta.get_field("file"), "storage", self.storage))
        self.client.force_authenticate(self.member)
        self.thread = reverse("chat-messages", args=[self.trainer.pk])

    def send_photo(self):
        data = photo_bytes()
        response = self.client.post(self.thread, {
            "text": "My progress",
            "attachments": [SimpleUploadedFile("progress.png", data, content_type="application/octet-stream")],
        }, format="multipart")
        self.assertEqual(response.status_code, 201, response.data)
        return data, response.data

    def test_member_and_trainer_can_message_and_download_privately(self):
        conversations_url = reverse("chat-conversations")
        self.assertEqual([c["id"] for c in self.client.get(conversations_url).data], [self.trainer.pk])
        content, sent = self.send_photo()
        attachment = sent["attachments"][0]
        self.assertEqual(attachment["content_type"], "image/png")
        self.assertFalse(attachment["expired"])

        self.client.force_authenticate(self.trainer)
        conversations = self.client.get(conversations_url).data
        self.assertEqual([c["id"] for c in conversations], [self.member.pk, self.other_member.pk])
        self.assertEqual(conversations[0]["last_message"]["text"], "My progress")
        reply = self.client.post(reverse("chat-messages", args=[self.member.pk]), {"text": "Thanks!"}, format="json")
        self.assertEqual(reply.status_code, 201, reply.data)
        self.assertEqual(reply.data["sender_id"], self.trainer.pk)

        download = self.client.get(attachment["url"])
        self.assertEqual(download.status_code, 200)
        self.assertEqual(download["Cache-Control"], "private, no-store")
        self.assertEqual(download["Content-Type"], "image/png")
        self.assertEqual(b"".join(download.streaming_content), content)

        self.client.force_authenticate(self.member)
        updated = self.client.get(self.thread, {"after": sent["id"]})
        self.assertEqual([message["id"] for message in updated.data["results"]], [reply.data["id"]])

    def test_chat_scope_tracks_assignment_and_excludes_other_roles(self):
        _, sent = self.send_photo()
        attachment_url = sent["attachments"][0]["url"]
        self.client.force_authenticate(user=None)
        self.assertEqual(self.client.get(attachment_url).status_code, 401)

        for user, code in ((self.other_member, 404), (self.other_trainer, 404), (self.admin, 403)):
            with self.subTest(user=user.username):
                self.client.force_authenticate(user)
                self.assertEqual(self.client.get(attachment_url).status_code, code)

        User.objects.filter(pk=self.member.pk).update(trainer=self.other_trainer)
        self.client.force_authenticate(self.trainer)
        self.assertEqual(self.client.get(reverse("chat-messages", args=[self.member.pk])).status_code, 404)
        self.assertEqual(self.client.get(attachment_url).status_code, 404)

        self.client.force_authenticate(self.other_trainer)
        self.assertEqual(self.client.get(attachment_url).status_code, 404)
        self.assertEqual(self.client.get(reverse("chat-messages", args=[self.member.pk])).data["results"], [])

    def test_invalid_message_and_attachments_save_nothing(self):
        GymBranding.objects.create(pk=1, chat_media_max_size_mb=1)
        fake_photo = SimpleUploadedFile("wrong.jpg", b"this is text", content_type="image/jpeg")
        large_photo = SimpleUploadedFile("photo.png", b"x" * (BYTES_PER_MB + 1), content_type="image/png")
        for data in ({"text": "   "}, {"attachments": [fake_photo]}, {"attachments": [large_photo]}):
            with self.subTest(fields=list(data)):
                response = self.client.post(self.thread, data, format="multipart")
                self.assertEqual(response.status_code, 400, response.data)
        self.assertFalse(ChatMessage.objects.exists())
        self.assertFalse(ChatAttachment.objects.exists())

    def test_failed_upload_removes_files_and_rolls_back_the_message(self):
        save_file = self.storage.save
        uploads = [SimpleUploadedFile(f"{i}.png", photo_bytes()) for i in range(2)]

        def fail_on_second_upload(name, upload, **kwargs):
            saved_name = save_file(name, upload, **kwargs)
            if upload.name == "1.png":
                raise OSError("Storage error")
            return saved_name

        with patch.object(self.storage, "save", side_effect=fail_on_second_upload):
            with self.assertRaises(OSError):
                self.client.post(self.thread, {"attachments": uploads}, format="multipart")

        self.assertFalse(ChatMessage.objects.exists())
        self.assertFalse(ChatAttachment.objects.exists())
        self.assertEqual(self.storage.listdir("chat"), ([], []))

    @skipUnless(file_command(), "The file utility identifies video uploads.")
    def test_message_can_attach_mixed_formats_with_unknown_reported_types(self):
        mp4_signature = b"\x00\x00\x00\x18ftypisom\x00\x00\x02\x00isommp41"
        attachments = [
            SimpleUploadedFile("clip", mp4_signature, content_type="application/octet-stream"),
            SimpleUploadedFile("photo", photo_bytes(), content_type="application/octet-stream"),
        ]
        response = self.client.post(self.thread, {"attachments": attachments}, format="multipart")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["text"], "")
        self.assertEqual([file["content_type"] for file in response.data["attachments"]], ["video/mp4", "image/png"])

    def test_expiry_applies_to_existing_files_and_preserves_messages(self):
        _, sent = self.send_photo()
        attachment_url = sent["attachments"][0]["url"]
        attachment = ChatAttachment.objects.get()
        saved_path = attachment.file.name
        ChatMessage.objects.filter(pk=sent["id"]).update(created_at=timezone.now() - timedelta(days=3))
        policy = GymBranding.objects.create(pk=1, chat_media_retention_days=None)
        call_command("purge_chat_media", verbosity=0)
        self.assertTrue(self.storage.exists(saved_path))

        policy.chat_media_retention_days = 1
        policy.save(update_fields=["chat_media_retention_days"])
        self.assertEqual(self.client.get(attachment_url).status_code, 404)
        self.assertTrue(self.storage.exists(saved_path))
        call_command("purge_chat_media", verbosity=0)
        call_command("purge_chat_media", verbosity=0)
        self.assertFalse(self.storage.exists(saved_path))

        policy.chat_media_retention_days = None
        policy.save(update_fields=["chat_media_retention_days"])
        response = self.client.get(self.thread)
        message = response.data["results"][0]
        self.assertEqual(message["text"], "My progress")
        self.assertTrue(message["attachments"][0]["expired"])
        self.assertTrue(message["attachments"][0]["deleted"])
        self.assertIsNone(message["attachments"][0]["url"])

    def test_history_and_polling_cursors_return_messages_in_order(self):
        messages = ChatMessage.objects.bulk_create([
            ChatMessage(member=self.member, trainer=self.trainer, sender=self.member, text=str(i))
            for i in range(55)
        ])
        latest = self.client.get(self.thread).data
        self.assertTrue(latest["has_older"])
        self.assertEqual([m["id"] for m in latest["results"]], [m.pk for m in messages[5:]])
        older = self.client.get(self.thread, {"before": messages[5].pk}).data
        self.assertFalse(older["has_older"])
        self.assertEqual([m["id"] for m in older["results"]], [m.pk for m in messages[:5]])
        first_updates = self.client.get(self.thread, {"after": 0}).data
        self.assertTrue(first_updates["has_newer"])
        self.assertEqual([m["id"] for m in first_updates["results"]], [m.pk for m in messages[:50]])

    def test_unread_tracks_incoming_messages_and_clears_independently(self):
        conversations_url = reverse("chat-conversations")
        unread_url = reverse("chat-unread")
        sent = self.client.post(self.thread, {"text": "Ready for training"}, format="json").data
        self.assertEqual(self.client.get(unread_url).data, {"unread": False})

        self.client.force_authenticate(self.other_member)
        other_sent = self.client.post(self.thread, {"text": "Another message"}, format="json").data
        self.client.force_authenticate(self.trainer)
        trainer_thread = reverse("chat-messages", args=[self.member.pk])
        reply = self.client.post(trainer_thread, {"text": "See you soon"}, format="json").data
        self.assertEqual(self.client.get(unread_url).data, {"unread": True})
        self.assertEqual(
            {row["id"]: row["unread"] for row in self.client.get(conversations_url).data},
            {self.member.pk: True, self.other_member.pk: True},
        )
        self.client.get(trainer_thread)
        self.assertEqual(self.client.get(unread_url).data, {"unread": True})
        member_read_url = reverse("chat-read", args=[self.member.pk])
        acknowledgement = self.client.post(member_read_url, {"through_id": sent["id"]}, format="json")
        self.assertEqual(acknowledgement.data, {"unread": False})
        self.assertEqual(self.client.get(unread_url).data, {"unread": True})
        other_member_read_url = reverse("chat-read", args=[self.other_member.pk])
        self.client.post(other_member_read_url, {"through_id": other_sent["id"]}, format="json")
        self.assertEqual(self.client.get(unread_url).data, {"unread": False})

        self.client.force_authenticate(self.member)
        self.assertEqual(self.client.get(unread_url).data, {"unread": True})
        self.assertTrue(self.client.get(conversations_url).data[0]["unread"])
        trainer_read_url = reverse("chat-read", args=[self.trainer.pk])
        self.client.post(trainer_read_url, {"through_id": reply["id"]}, format="json")
        self.assertEqual(self.client.get(unread_url).data, {"unread": False})

    def test_read_cursor_only_advances_through_a_message_in_this_thread(self):
        first = self.client.post(self.thread, {"text": "First"}, format="json").data
        second = self.client.post(self.thread, {"text": "Second"}, format="json").data
        self.client.force_authenticate(self.other_member)
        other = self.client.post(self.thread, {"text": "Separate thread"}, format="json").data
        read_url = reverse("chat-read", args=[self.member.pk])
        self.client.force_authenticate(self.trainer)
        self.assertEqual(self.client.post(read_url, {"through_id": other["id"]}, format="json").status_code, 404)
        for message_id, unread in ((first["id"], True), (second["id"], False), (first["id"], False)):
            with self.subTest(through_id=message_id, unread=unread):
                response = self.client.post(read_url, {"through_id": message_id}, format="json")
                self.assertEqual(response.data, {"unread": unread})

    def test_inactive_assignments_are_excluded_from_unread_status(self):
        unread_url = reverse("chat-unread")
        sent = self.client.post(self.thread, {"text": "Assigned trainer only"}, format="json").data
        self.client.force_authenticate(self.trainer)
        self.assertEqual(self.client.get(unread_url).data, {"unread": True})
        User.objects.filter(pk=self.member.pk).update(trainer=self.other_trainer)
        self.assertEqual(self.client.get(unread_url).data, {"unread": False})
        read_url = reverse("chat-read", args=[self.member.pk])
        self.assertEqual(self.client.post(read_url, {"through_id": sent["id"]}, format="json").status_code, 404)

        self.client.force_authenticate(self.other_trainer)
        self.assertEqual(self.client.get(unread_url).data, {"unread": False})
        self.assertEqual(self.client.post(read_url, {"through_id": sent["id"]}, format="json").status_code, 404)

        User.objects.filter(pk=self.member.pk).update(trainer=self.trainer)
        self.client.force_authenticate(self.trainer)
        self.assertEqual(self.client.get(unread_url).data, {"unread": True})
        self.client.post(read_url, {"through_id": sent["id"]}, format="json")
        self.assertEqual(self.client.get(unread_url).data, {"unread": False})

        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get(unread_url).status_code, 403)
