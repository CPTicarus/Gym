import io
import shutil
import tempfile
from datetime import timedelta
from pathlib import Path

from django.core.cache import cache
from django.core.files.storage import FileSystemStorage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase

from .models import BodyPhoto, User


def make_user(role, username):
    return User.objects.create_user(
        username=username, password="pass-1234-long", role=role, national_id=f"{abs(hash(username)) % 10**10:010d}"
    )


def png(name="photo.png"):
    buffer = io.BytesIO()
    Image.new("RGB", (4, 4), "white").save(buffer, "PNG")
    return SimpleUploadedFile(name, buffer.getvalue(), content_type="image/png")


class BodyPhotoExtrasTests(APITestCase):
    """Real image files, written to a temporary directory instead of
    PRIVATE_MEDIA_ROOT — the photo field's storage is swapped for the test
    and put back afterwards."""

    def setUp(self):
        self.files = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.files, ignore_errors=True)
        field = BodyPhoto._meta.get_field("image")
        original = field.storage
        field.storage = FileSystemStorage(location=self.files)
        self.addCleanup(setattr, field, "storage", original)

        self.member = make_user(User.Role.MEMBER, "member")
        self.client.force_authenticate(self.member)

    def _stored_files(self):
        return sorted(p.name for p in self.files.rglob("*") if p.is_file())

    def _add(self, pose="extra", note="", image=None):
        data = {"pose": pose, "image": image or png()}
        if note:
            data["note"] = note
        return self.client.post("/api/me/body-photos/", data, format="multipart")

    def test_main_poses_still_replace_themselves(self):
        first = self._add("front")
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        second = self._add("front")
        self.assertEqual(second.data["id"], first.data["id"])
        self.assertEqual(BodyPhoto.objects.count(), 1)
        self.assertEqual(len(self._stored_files()), 1)  # the replaced file is gone

    def test_an_extra_is_just_a_photo(self):
        self._add("front")
        a = self._add()  # nothing but the image
        b = self._add(note="۸ هفته بعد از شروع کات")
        self.assertEqual((a.status_code, b.status_code), (201, 201))
        self.assertNotEqual(a.data["id"], b.data["id"])

        listed = self.client.get("/api/me/body-photos/").data["results"]
        self.assertEqual(
            [(p["pose"], p["note"]) for p in listed],
            [("extra", ""), ("extra", "۸ هفته بعد از شروع کات"), ("front", "")],
        )

    def test_main_poses_take_no_note(self):
        on_main = self._add("front", note="از روبرو")
        self.assertEqual(on_main.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("note", on_main.data)
        self.assertEqual(BodyPhoto.objects.count(), 0)

    def test_extras_are_capped(self):
        for _ in range(BodyPhoto.MAX_EXTRAS):
            self.assertEqual(self._add().status_code, 201)
        over = self._add()
        self.assertEqual(over.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(BodyPhoto.objects.filter(pose="extra").count(), BodyPhoto.MAX_EXTRAS)
        # The three main poses aren't counted against it.
        self.assertEqual(self._add("back").status_code, 201)

    def test_patch_replaces_an_extra_and_sets_or_clears_its_note(self):
        extra = self._add().data
        url = f"/api/me/body-photos/{extra['id']}/"
        before = self._stored_files()

        replaced = self.client.patch(url, {"image": png("new.png")}, format="multipart")
        self.assertEqual(replaced.status_code, status.HTTP_200_OK)
        after = self._stored_files()
        self.assertEqual(len(after), 1)
        self.assertNotEqual(after, before)  # new file in, old file out

        noted = self.client.patch(url, {"note": "صبح ناشتا"}, format="multipart")
        self.assertEqual(noted.data["note"], "صبح ناشتا")
        cleared = self.client.patch(url, {"note": ""}, format="multipart")
        self.assertEqual((cleared.status_code, cleared.data["note"]), (200, ""))
        promoted = self.client.patch(url, {"pose": "front"}, format="multipart")
        self.assertEqual(promoted.status_code, status.HTTP_400_BAD_REQUEST)

    def test_extras_follow_the_same_who_may_look_rules(self):
        extra_id = self._add(note="زیربغل باز").data["id"]
        trainer = make_user(User.Role.TRAINER, "trainer")
        accounting = make_user(User.Role.ACCOUNTING, "desk")
        stranger = make_user(User.Role.MEMBER, "stranger")

        self.client.force_authenticate(trainer)
        photos = self.client.get(f"/api/users/{self.member.pk}/body-photos/").data
        self.assertEqual([(p["pose"], p["note"]) for p in photos], [("extra", "زیربغل باز")])
        response = self.client.get(f"/api/body-photos/{extra_id}/file/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn(f"extra-{extra_id}.png", response["Content-Disposition"])

        self.client.force_authenticate(accounting)
        self.assertEqual(
            self.client.get(f"/api/users/{self.member.pk}/body-photos/").status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.client.force_authenticate(stranger)
        self.assertEqual(
            self.client.get(f"/api/body-photos/{extra_id}/file/").status_code, status.HTTP_404_NOT_FOUND
        )

    def test_gym_examples_stay_main_poses_only(self):
        self.client.force_authenticate(make_user(User.Role.TRAINER, "trainer"))
        response = self.client.post(
            "/api/body-photo-examples/", {"pose": "extra", "image": png()}, format="multipart"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("pose", response.data)


class ChangePasswordTests(APITestCase):
    url = "/api/auth/change-password/"

    def setUp(self):
        cache.clear()  # the throttle counts in the cache
        self.member = make_user(User.Role.MEMBER, "member")
        self.client.force_authenticate(self.member)

    def _change(self, current, new):
        return self.client.post(self.url, {"current_password": current, "password": new})

    def test_member_can_change_to_a_pin_and_sign_in_with_it(self):
        self.assertEqual(self._change("pass-1234-long", "4821").status_code, status.HTTP_204_NO_CONTENT)
        self.client.force_authenticate(None)
        login = self.client.post("/api/auth/login/", {"username": "member", "password": "4821"})
        self.assertEqual(login.status_code, status.HTTP_200_OK)
        old = self.client.post("/api/auth/login/", {"username": "member", "password": "pass-1234-long"})
        self.assertEqual(old.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_wrong_current_password_changes_nothing(self):
        response = self._change("not-it", "4821")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("current_password", response.data)
        self.member.refresh_from_db()
        self.assertTrue(self.member.check_password("pass-1234-long"))

    def test_the_rules_are_the_accounts_own_roles(self):
        # Too short even for a member...
        self.assertIn("password", self._change("pass-1234-long", "12").data)
        # ...and a PIN that's fine for a member is refused for staff.
        trainer = make_user(User.Role.TRAINER, "trainer")
        self.client.force_authenticate(trainer)
        weak = self._change("pass-1234-long", "4821")
        self.assertEqual(weak.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password", weak.data)
        self.assertEqual(self._change("pass-1234-long", "Str0nger-Gym-Pass!").status_code, 204)

    def test_same_password_again_is_refused(self):
        response = self._change("pass-1234-long", "pass-1234-long")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password", response.data)

    def test_guessing_is_rate_limited(self):
        codes = [self._change(f"guess-{n}", "4821").status_code for n in range(11)]
        self.assertEqual(codes[:10], [400] * 10)
        self.assertEqual(codes[10], status.HTTP_429_TOO_MANY_REQUESTS)

    def test_needs_to_be_signed_in(self):
        self.client.force_authenticate(None)
        self.assertEqual(self._change("x", "y").status_code, status.HTTP_401_UNAUTHORIZED)


class ExtendMembershipTests(APITestCase):
    def setUp(self):
        self.today = timezone.now().date()
        self.member = make_user(User.Role.MEMBER, "member")
        self.accounting = make_user(User.Role.ACCOUNTING, "desk")
        self.client.force_authenticate(self.accounting)

    def _extend(self, user=None, **body):
        return self.client.post(f"/api/users/{(user or self.member).pk}/extend-membership/", body)

    def _set(self, start, end):
        User.objects.filter(pk=self.member.pk).update(membership_start_date=start, membership_end_date=end)

    def test_running_membership_gets_30_days_after_its_end(self):
        start, end = self.today - timedelta(days=20), self.today + timedelta(days=10)
        self._set(start, end)
        response = self._extend()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["membership_end_date"], str(end + timedelta(days=30)))
        self.assertEqual(response.data["membership_start_date"], str(start))  # unchanged
        self.assertTrue(response.data["is_membership_active"])

    def test_ending_today_still_counts_as_running(self):
        self._set(self.today - timedelta(days=30), self.today)
        self.assertEqual(self._extend().data["membership_end_date"], str(self.today + timedelta(days=30)))

    def test_lapsed_membership_starts_again_from_today(self):
        self._set(self.today - timedelta(days=90), self.today - timedelta(days=45))
        data = self._extend().data
        self.assertEqual(data["membership_start_date"], str(self.today))
        self.assertEqual(data["membership_end_date"], str(self.today + timedelta(days=30)))
        self.assertTrue(data["is_membership_active"])

    def test_never_set_starts_from_today(self):
        data = self._extend().data
        self.assertEqual(
            (data["membership_start_date"], data["membership_end_date"]),
            (str(self.today), str(self.today + timedelta(days=30))),
        )

    def test_days_can_be_given_and_are_bounded(self):
        self.assertEqual(self._extend(days=90).data["membership_end_date"], str(self.today + timedelta(days=90)))
        self.assertEqual(self._extend(days=0).status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self._extend(days=3650).status_code, status.HTTP_400_BAD_REQUEST)

    def test_admin_can_too_but_trainers_and_members_cannot(self):
        self.client.force_authenticate(make_user(User.Role.ADMIN, "boss"))
        self.assertEqual(self._extend().status_code, status.HTTP_200_OK)
        for role, name in ((User.Role.TRAINER, "coach"), (User.Role.MEMBER, "other")):
            self.client.force_authenticate(make_user(role, name))
            self.assertEqual(self._extend().status_code, status.HTTP_403_FORBIDDEN)
        self.member.refresh_from_db()
        self.assertEqual(self.member.membership_end_date, self.today + timedelta(days=30))

    def test_only_members_have_a_membership_to_extend(self):
        self.client.force_authenticate(make_user(User.Role.ADMIN, "boss"))
        trainer = make_user(User.Role.TRAINER, "coach")
        self.assertEqual(self._extend(user=trainer).status_code, status.HTTP_400_BAD_REQUEST)
        # Accounting can't even see staff records.
        self.client.force_authenticate(self.accounting)
        self.assertEqual(self._extend(user=trainer).status_code, status.HTTP_404_NOT_FOUND)
