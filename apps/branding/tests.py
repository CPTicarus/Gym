from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from .models import GymBranding


class BrandingTests(APITestCase):
    url = "/api/config/branding/"
    chat_media_url = "/api/config/chat-media/"

    def sign_in(self, role):
        user = get_user_model().objects.create(username=role, national_id=str(self.user_count), role=role)
        self.user_count += 1
        self.client.force_authenticate(user)

    def setUp(self):
        self.user_count = 1

    def test_only_gym_admins_can_publish(self):
        change = {"name": "Demo Club"}
        self.assertEqual(self.client.patch(self.url, change, format="json").status_code, 401)
        self.assertEqual(self.client.patch(self.chat_media_url, {}, format="json").status_code, 401)
        for role in ("member", "trainer", "accounting"):
            self.sign_in(role)
            self.assertEqual(self.client.patch(self.url, change, format="json").status_code, 403)
            self.assertEqual(self.client.patch(self.chat_media_url, {}, format="json").status_code, 403)
        self.assertFalse(GymBranding.objects.exists())

    def test_chat_media_defaults_limits_and_never_delete(self):
        defaults = {"chat_media_max_size_mb": 25, "chat_media_retention_days": 30}
        self.assertEqual(self.client.get("/api/config/").data["chat_media"], defaults)
        self.sign_in("admin")
        self.client.patch(self.url, {"name": "Demo Club"}, format="json")
        self.assertEqual(self.client.get(self.chat_media_url).data, defaults)
        for field, value in (
            ("chat_media_max_size_mb", 0),
            ("chat_media_max_size_mb", 101),
            ("chat_media_max_size_mb", None),
            ("chat_media_retention_days", 0),
            ("chat_media_retention_days", 36501),
        ):
            with self.subTest(field=field, value=value):
                response = self.client.patch(self.chat_media_url, {field: value}, format="json")
                self.assertEqual(response.status_code, 400)
        self.assertEqual(self.client.get(self.chat_media_url).data, defaults)

        response = self.client.patch(self.chat_media_url, {"chat_media_retention_days": None}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {**defaults, "chat_media_retention_days": None})
        response = self.client.patch(self.chat_media_url, {"chat_media_max_size_mb": 100}, format="json")
        self.assertEqual(response.status_code, 200)

        self.client.force_authenticate(None)
        config = self.client.get("/api/config/").data
        self.assertEqual(config["chat_media"], {"chat_media_max_size_mb": 100, "chat_media_retention_days": None})
        self.assertEqual(config["branding"], {"name": "Demo Club"})

    def test_partial_edits_resets_and_public_read(self):
        self.sign_in("admin")
        initial = {
            "name": "Demo Club", "tagline": "A gym", "note": "", "ticker": [],
            "greetings": ["سلام {name}"], "scheme": "forest",
            "light_colors": {"canvas": "#eeffee", "accent-soft": "#12345624"},
            "dark_colors": {"ink": "#ffffff"},
        }
        response = self.client.patch(self.url, initial, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, initial)
        change = {"name": None, "light_colors": {"canvas": None, "surface": "#fedcba"}}
        response = self.client.patch(self.url, change, format="json")
        expected = {**initial, "light_colors": {"surface": "#fedcba", "accent-soft": "#12345624"}}
        del expected["name"]
        self.assertEqual(response.data, expected)
        self.client.force_authenticate(None)
        self.client.credentials(HTTP_AUTHORIZATION="Bearer stale.token.value")
        public = self.client.get("/api/config/")
        self.assertEqual(public.status_code, 200)
        self.assertEqual(public.data["branding"], expected)

    def test_bad_changes_are_atomic(self):
        self.sign_in("admin")
        for invalid in (
            {"scheme": "missing"}, {"light_colors": {"canvas": "blue"}},
            {"dark_colors": {"unlisted": "#ffffff"}}, {"ticker": ["   "]},
            {"greetings": "a line"}, {"greetings": ["x"] * 41}, {"member_signup": "self"},
        ):
            with self.subTest(invalid=invalid):
                response = self.client.patch(self.url, {"name": "Demo", **invalid}, format="json")
                self.assertEqual(response.status_code, 400)
        self.assertFalse(GymBranding.objects.exists())
