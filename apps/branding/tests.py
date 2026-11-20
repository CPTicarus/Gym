from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from .models import GymBranding


class BrandingTests(APITestCase):
    url = "/api/config/branding/"

    def sign_in(self, role):
        user = get_user_model().objects.create(username=role, national_id=str(self.user_count), role=role)
        self.user_count += 1
        self.client.force_authenticate(user)

    def setUp(self):
        self.user_count = 1

    def test_only_gym_admins_can_publish(self):
        change = {"name": "Demo Club"}
        self.assertEqual(self.client.patch(self.url, change, format="json").status_code, 401)
        for role in ("member", "trainer", "accounting"):
            self.sign_in(role)
            self.assertEqual(self.client.patch(self.url, change, format="json").status_code, 403)
        self.assertFalse(GymBranding.objects.exists())

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
