import io
import shutil
import tempfile
from datetime import timedelta
from pathlib import Path

from django.core.cache import cache
from django.core.files.storage import FileSystemStorage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings
from django.utils import timezone
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase

from apps.diet.models import DietAssignment, DietPlan
from apps.supplements.models import SupplementAssignment, SupplementPlan
from apps.workouts.models import WorkoutAssignment, WorkoutDay, WorkoutPlan, WorkoutSession

from .models import BodyPhoto, User
from .throttling import RegisterRateThrottle


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
        other_trainer = make_user(User.Role.TRAINER, "other-trainer")
        accounting = make_user(User.Role.ACCOUNTING, "desk")
        stranger = make_user(User.Role.MEMBER, "stranger")
        User.objects.filter(pk=self.member.pk).update(trainer=trainer)

        self.client.force_authenticate(trainer)
        photos = self.client.get(f"/api/users/{self.member.pk}/body-photos/").data
        self.assertEqual([(p["pose"], p["note"]) for p in photos], [("extra", "زیربغل باز")])
        response = self.client.get(f"/api/body-photos/{extra_id}/file/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn(f"extra-{extra_id}.png", response["Content-Disposition"])
        response.close()

        self.client.force_authenticate(other_trainer)
        self.assertEqual(self.client.get(f"/api/users/{self.member.pk}/body-photos/").status_code, 404)
        self.assertEqual(self.client.get(f"/api/body-photos/{extra_id}/file/").status_code, 404)

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


SIGNUP = {
    "username": "newbie",
    "national_id": "0012345678",
    "password": "4821",
    "password_confirm": "4821",
    "first_name": "Sara",
    "last_name": "Rahimi",
    "phone_number": "09121234567",
    "gender": "female",
    "date_of_birth": "1995-04-12",
}


@override_settings(MEMBER_SIGNUP="staff")
class StaffManagedGymTests(APITestCase):
    """The default: the front desk makes every member account, and nothing
    is ever locked. Sign-up used to be open here regardless — now it isn't."""

    def test_sign_up_is_closed(self):
        response = self.client.post("/api/auth/register/", SIGNUP, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(User.objects.filter(username="newbie").exists())
        self.assertEqual(self.client.get("/api/auth/signup-trainers/").status_code, status.HTTP_403_FORBIDDEN)

    def test_closed_reads_as_403_even_with_a_stale_token(self):
        # A browser can still hold an old session's token. That mustn't
        # turn "closed" into "please log in".
        self.client.credentials(HTTP_AUTHORIZATION="Bearer stale.token.value")
        response = self.client.post("/api/auth/register/", SIGNUP, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_the_app_is_told_which_workflow_this_is(self):
        response = self.client.get("/api/config/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {"member_signup": "staff", "branding": {}})

    def test_a_member_without_a_membership_still_sees_their_plans(self):
        member = make_user(User.Role.MEMBER, "member")
        WorkoutAssignment.objects.create(plan=WorkoutPlan.objects.create(name="Push"), user=member)
        self.client.force_authenticate(member)
        response = self.client.get("/api/my-workout-plans/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 1)
        me = self.client.get("/api/auth/me/").data
        self.assertEqual((me["plans_locked"], me["plan_ready"]), (False, None))


@override_settings(MEMBER_SIGNUP="self")
class SelfSignupTests(APITestCase):
    def setUp(self):
        cache.clear()  # the sign-up throttle counts in the cache

    def _signup(self, **changes):
        return self.client.post("/api/auth/register/", {**SIGNUP, **changes}, format="json")

    def test_signing_up_makes_a_member_who_can_sign_in(self):
        response = self._signup()
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertNotIn("password", response.data)
        self.assertEqual(User.objects.get(username="newbie").role, User.Role.MEMBER)
        login = self.client.post("/api/auth/login/", {"username": "newbie", "password": "4821"})
        self.assertEqual(login.status_code, status.HTTP_200_OK)

    def test_nobody_signs_themselves_up_as_staff(self):
        self._signup(role="admin")
        self.assertEqual(User.objects.get(username="newbie").role, User.Role.MEMBER)

    def test_signup_directory_exposes_only_active_trainers_and_their_names(self):
        trainer = make_user(User.Role.TRAINER, "trainer")
        User.objects.filter(pk=trainer.pk).update(first_name="Mina", last_name="Ahmadi", email="coach@example.com")
        inactive = make_user(User.Role.TRAINER, "inactive")
        User.objects.filter(pk=inactive.pk).update(is_active=False)
        admin = make_user(User.Role.ADMIN, "admin")
        accounting = make_user(User.Role.ACCOUNTING, "accounting")
        member = make_user(User.Role.MEMBER, "member")

        response = self.client.get("/api/auth/signup-trainers/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [{"id": trainer.pk, "name": "Mina Ahmadi"}])
        for unavailable in [inactive, admin, accounting, member]:
            with self.subTest(role=unavailable.role, active=unavailable.is_active):
                invalid = self._signup(trainer_id=unavailable.pk)
                self.assertEqual(invalid.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn("trainer_id", invalid.data)

        self.assertEqual(self._signup(trainer_id=trainer.pk).status_code, status.HTTP_201_CREATED)
        newcomer = User.objects.get(username="newbie")
        self.assertEqual(newcomer.trainer_id, trainer.pk)
        self.client.force_authenticate(newcomer)
        self.assertEqual(self.client.get("/api/auth/me/").data["trainer"], response.data[0])

    def test_letting_the_gym_choose_leaves_the_member_unassigned(self):
        trainer = make_user(User.Role.TRAINER, "trainer")
        self.assertEqual(self._signup(trainer_id=None).status_code, status.HTTP_201_CREATED)
        member = User.objects.get(username="newbie")
        self.assertIsNone(member.trainer_id)
        self.client.force_authenticate(trainer)
        queue = self.client.get("/api/users/unassigned-members/").data["results"]
        self.assertEqual(queue, [{"id": member.pk, "first_name": "Sara", "last_name": "Rahimi"}])

    def test_sex_and_birth_date_are_required(self):
        # The trainer writes the plan around both, and nobody else will ask.
        without = {k: v for k, v in SIGNUP.items() if k not in ("gender", "date_of_birth")}
        missing = self.client.post("/api/auth/register/", without, format="json")
        self.assertEqual(missing.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(set(missing.data), {"gender", "date_of_birth"})
        self.assertIn("gender", self._signup(gender="").data)
        self.assertIn("date_of_birth", self._signup(date_of_birth=str(timezone.localdate())).data)
        self.assertFalse(User.objects.filter(username="newbie").exists())

        self.assertEqual(self._signup().status_code, status.HTTP_201_CREATED)
        user = User.objects.get(username="newbie")
        self.assertEqual((user.gender, str(user.date_of_birth)), ("female", "1995-04-12"))

    def test_the_usual_identity_rules_apply(self):
        self._signup()
        same_id = self._signup(username="someone-else")
        self.assertEqual(same_id.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("national_id", same_id.data)
        mismatch = self._signup(username="third", national_id="0098765432", password_confirm="1111")
        self.assertIn("password_confirm", mismatch.data)

    def test_rate_limited_per_address(self):
        allowed = RegisterRateThrottle().num_requests
        # Empty forms are refused as invalid, but every attempt still counts.
        codes = {self.client.post("/api/auth/register/", {}).status_code for _ in range(allowed)}
        self.assertEqual(codes, {status.HTTP_400_BAD_REQUEST})
        self.assertEqual(self._signup().status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_the_app_is_told_which_workflow_this_is(self):
        self.assertEqual(self.client.get("/api/config/").data, {"member_signup": "self", "branding": {}})


@override_settings(MEMBER_SIGNUP="self")
class PlanLockTests(APITestCase):
    """In a self sign-up gym a member sees none of their plans until they've
    paid — which, until there's a payment gateway, means an active
    membership."""

    PLAN_ENDPOINTS = ["/api/my-workout-plans/", "/api/my-diet-plans/", "/api/my-supplement-plans/"]

    def setUp(self):
        self.today = timezone.now().date()
        self.member = make_user(User.Role.MEMBER, "member")
        workout = WorkoutPlan.objects.create(name="Push")
        WorkoutDay.objects.create(plan=workout, name="Chest")
        self.assignment = WorkoutAssignment.objects.create(plan=workout, user=self.member)
        DietAssignment.objects.create(plan=DietPlan.objects.create(name="Cut"), user=self.member)
        SupplementAssignment.objects.create(
            plan=SupplementPlan.objects.create(name="Creatine"), user=self.member
        )
        self.client.force_authenticate(self.member)

    def _membership(self, start, end):
        User.objects.filter(pk=self.member.pk).update(membership_start_date=start, membership_end_date=end)
        # force_authenticate hands every request this same object, where a
        # real (JWT) request loads the user afresh.
        self.member.refresh_from_db()

    def _finish_day(self):
        return self.client.post(f"/api/my-workout-plans/{self.assignment.pk}/finish-day/", {}, format="json")

    def _me(self):
        data = self.client.get("/api/auth/me/").data
        return data["plans_locked"], data["plan_ready"]

    def test_before_paying_no_plan_comes_back(self):
        for url in self.PLAN_ENDPOINTS:
            response = self.client.get(url)
            self.assertEqual(response.status_code, status.HTTP_402_PAYMENT_REQUIRED, url)
            self.assertNotIn("results", response.data)
        self.assertEqual(self._finish_day().status_code, status.HTTP_402_PAYMENT_REQUIRED)
        self.assertFalse(WorkoutSession.objects.exists())

    def test_the_member_is_told_whether_a_plan_is_waiting(self):
        self.assertEqual(self._me(), (True, True))
        WorkoutAssignment.objects.update(status="completed")
        DietAssignment.objects.all().delete()
        self.assertEqual(self._me(), (True, True))  # the supplement protocol is still waiting
        SupplementAssignment.objects.all().delete()
        self.assertEqual(self._me(), (True, False))  # a finished plan isn't a ready one

    def test_paying_opens_every_plan(self):
        self._membership(self.today, self.today + timedelta(days=30))
        for url in self.PLAN_ENDPOINTS:
            response = self.client.get(url)
            self.assertEqual(response.status_code, status.HTTP_200_OK, url)
            self.assertEqual(len(response.data["results"]), 1, url)
        self.assertEqual(self._finish_day().status_code, status.HTTP_200_OK)
        self.assertEqual(self._me(), (False, None))

    def test_the_desk_recording_a_payment_opens_them(self):
        # Today's way of recording a payment: "+30 days" on the member's page.
        self.client.force_authenticate(make_user(User.Role.ACCOUNTING, "desk"))
        extended = self.client.post(f"/api/users/{self.member.pk}/extend-membership/")
        self.assertFalse(extended.data["plans_locked"])
        self.member.refresh_from_db()
        self.client.force_authenticate(self.member)
        self.assertEqual(self.client.get("/api/my-workout-plans/").status_code, status.HTTP_200_OK)

    def test_they_lock_again_when_the_membership_lapses(self):
        self._membership(self.today - timedelta(days=60), self.today - timedelta(days=1))
        self.assertEqual(self.client.get("/api/my-workout-plans/").status_code, 402)
        self._membership(self.today - timedelta(days=30), self.today)  # the last day still counts
        self.assertEqual(self.client.get("/api/my-workout-plans/").status_code, 200)

    def test_the_rest_of_the_member_side_stays_open(self):
        # Measurements are what the trainer writes the plan from, and past
        # sessions are the member's own history.
        self.assertEqual(self.client.post("/api/me/measurements/", {"weight_kg": 80}).status_code, 201)
        self.assertEqual(self.client.get("/api/my-workout-sessions/").status_code, 200)
        self.assertEqual(self.client.get("/api/moves/").status_code, 200)

    def test_staff_are_not_locked_and_can_see_who_is(self):
        trainer = make_user(User.Role.TRAINER, "coach")
        User.objects.filter(pk=self.member.pk).update(trainer=trainer)
        self.client.force_authenticate(trainer)
        self.assertEqual(self._me(), (False, None))
        plan = self.client.get(f"/api/workout-plans/{self.assignment.plan_id}/")
        self.assertEqual(plan.status_code, status.HTTP_200_OK)
        self.assertTrue(self.client.get(f"/api/users/{self.member.pk}/").data["plans_locked"])


class WaitingForPlanTests(APITestCase):
    """The trainer's queue: members with no active workout plan, the one
    who has waited longest first."""

    def setUp(self):
        self.first, self.second, self.planned = (
            make_user(User.Role.MEMBER, name) for name in ("first", "second", "planned")
        )
        plan = WorkoutPlan.objects.create(name="Push")
        WorkoutAssignment.objects.create(plan=plan, user=self.planned)
        # A finished plan doesn't take someone out of the queue.
        WorkoutAssignment.objects.create(plan=plan, user=self.second, status="completed")
        trainer = make_user(User.Role.TRAINER, "coach")
        User.objects.filter(pk__in=[self.first.pk, self.second.pk, self.planned.pk]).update(trainer=trainer)
        self.client.force_authenticate(trainer)

    def _usernames(self, **params):
        return [u["username"] for u in self.client.get("/api/users/", params).data["results"]]

    def test_members_without_an_active_plan_longest_waiting_first(self):
        self.assertEqual(self._usernames(waiting_for_plan="true"), ["first", "second"])

    def test_staff_never_queue_even_in_the_admins_view(self):
        self.client.force_authenticate(make_user(User.Role.ADMIN, "boss"))
        self.assertEqual(self._usernames(waiting_for_plan="true"), ["first", "second"])

    def test_without_it_the_directory_is_unchanged(self):
        self.assertEqual(self._usernames(), ["planned", "second", "first"])


class TrainerMemberAccessTests(APITestCase):
    queue_url = "/api/users/unassigned-members/"

    @classmethod
    def setUpTestData(cls):
        cls.trainer = make_user(User.Role.TRAINER, "coach")
        cls.other_trainer = make_user(User.Role.TRAINER, "other-coach")
        cls.admin = make_user(User.Role.ADMIN, "admin")
        cls.accounting = make_user(User.Role.ACCOUNTING, "accounting")
        cls.member = make_user(User.Role.MEMBER, "mine")
        cls.other_member = make_user(User.Role.MEMBER, "other-member")
        cls.unassigned = make_user(User.Role.MEMBER, "pending")
        User.objects.filter(pk=cls.member.pk).update(trainer=cls.trainer)
        User.objects.filter(pk=cls.other_member.pk).update(trainer=cls.other_trainer)

    def test_trainers_can_only_list_search_and_open_their_members(self):
        self.client.force_authenticate(self.trainer)
        for filters in [{}, {"waiting_for_plan": "true"}, {"role": "member"}]:
            with self.subTest(filters=filters):
                users = self.client.get("/api/users/", filters).data["results"]
                self.assertEqual([user["id"] for user in users], [self.member.pk])
        self.assertEqual(self.client.get("/api/users/", {"search": "other-member"}).data["count"], 0)
        self.assertEqual(self.client.get(f"/api/users/{self.member.pk}/").status_code, 200)
        for hidden in [self.other_member, self.unassigned, self.other_trainer]:
            self.assertEqual(self.client.get(f"/api/users/{hidden.pk}/").status_code, 404)

    def test_queue_shows_only_names_of_active_unassigned_members(self):
        User.objects.filter(pk=self.unassigned.pk).update(
            first_name="Sara", last_name="Rahimi", email="private@example.com", phone_number="09121234567"
        )
        inactive = make_user(User.Role.MEMBER, "inactive-member")
        User.objects.filter(pk=inactive.pk).update(is_active=False)
        self.client.force_authenticate(self.trainer)

        expected = [{"id": self.unassigned.pk, "first_name": "Sara", "last_name": "Rahimi"}]
        self.assertEqual(self.client.get(self.queue_url).data["results"], expected)
        self.assertEqual(self.client.get(self.queue_url, {"search": "Sara Rahimi"}).data["results"], expected)
        for private in ["pending", "private@example.com", "09121234567"]:
            with self.subTest(private=private):
                self.assertEqual(self.client.get(self.queue_url, {"search": private}).data["count"], 0)
        self.assertEqual(self.client.post(f"/api/users/{inactive.pk}/claim/").status_code, 404)

    def test_only_active_trainers_can_list_or_claim_unassigned_members(self):
        inactive = make_user(User.Role.TRAINER, "inactive-trainer")
        inactive.is_active = False
        inactive.save(update_fields=["is_active"])
        for actor in [self.accounting, self.admin, self.member, inactive]:
            with self.subTest(actor=actor):
                self.client.force_authenticate(actor)
                self.assertEqual(self.client.get(self.queue_url).status_code, 403)
                self.assertEqual(self.client.post(f"/api/users/{self.unassigned.pk}/claim/").status_code, 403)
        self.unassigned.refresh_from_db()
        self.assertIsNone(self.unassigned.trainer_id)

    def test_first_trainer_to_claim_gets_exclusive_access(self):
        member_url = f"/api/users/{self.unassigned.pk}/"
        claim_url = f"{member_url}claim/"
        for trainer in [self.trainer, self.other_trainer]:
            self.client.force_authenticate(trainer)
            self.assertEqual(self.client.get(self.queue_url).data["count"], 1)
            self.assertEqual(self.client.get(member_url).status_code, 404)
            self.assertEqual(self.client.get(f"{member_url}body-photos/").status_code, 404)

        self.client.force_authenticate(self.trainer)
        self.assertEqual(self.client.post(claim_url, {"trainer_id": self.other_trainer.pk}).status_code, 204)
        self.assertEqual(self.client.post(claim_url).status_code, 204)
        self.assertEqual(self.client.get(member_url).status_code, 200)
        self.assertEqual(self.client.get(f"{member_url}body-photos/").status_code, 200)
        self.assertEqual(self.client.post(f"/api/users/{self.other_member.pk}/claim/").status_code, 404)
        self.assertEqual(self.client.post("/api/users/invalid/claim/").status_code, 404)
        self.unassigned.refresh_from_db()
        self.assertEqual(self.unassigned.trainer_id, self.trainer.pk)

        self.client.force_authenticate(self.other_trainer)
        self.assertEqual(self.client.get(self.queue_url).data["count"], 0)
        self.assertEqual(self.client.post(claim_url).status_code, 404)
        self.assertEqual(self.client.get(member_url).status_code, 404)

    def test_admin_can_fill_the_queue_and_reassign_or_clear_a_trainer(self):
        url = f"/api/users/{self.unassigned.pk}/"
        options_url = "/api/users/available-trainers/"
        self.client.force_authenticate(self.accounting)
        self.assertEqual(self.client.get(options_url).status_code, 403)
        self.assertEqual(self.client.get(url).status_code, 200)
        self.client.patch(url, {"trainer_id": self.trainer.pk}, format="json")
        self.unassigned.refresh_from_db()
        self.assertIsNone(self.unassigned.trainer_id)

        self.client.force_authenticate(self.admin)
        queue = self.client.get("/api/users/", {"needs_trainer": "true"}).data["results"]
        self.assertEqual([user["id"] for user in queue], [self.unassigned.pk])
        self.assertEqual({item["id"] for item in self.client.get(options_url).data}, {self.trainer.pk, self.other_trainer.pk})
        self.assertEqual(self.client.patch(url, {"trainer_id": self.admin.pk}, format="json").status_code, 400)
        assigned = self.client.patch(url, {"trainer_id": self.trainer.pk}, format="json")
        self.assertEqual(assigned.status_code, 200)
        self.assertEqual(assigned.data["trainer"]["id"], self.trainer.pk)
        self.assertEqual(self.client.get("/api/users/", {"needs_trainer": "true"}).data["count"], 0)

        self.client.force_authenticate(self.unassigned)
        own_profile = self.client.patch("/api/auth/me/", {"trainer_id": self.other_trainer.pk}, format="json")
        self.assertEqual(own_profile.data["trainer"]["id"], self.trainer.pk)

        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.patch(url, {"trainer_id": self.other_trainer.pk}, format="json").status_code, 200)
        self.client.force_authenticate(self.trainer)
        self.assertEqual(self.client.get(url).status_code, 404)
        self.client.force_authenticate(self.other_trainer)
        self.assertEqual(self.client.get(url).status_code, 200)

        self.client.force_authenticate(self.admin)
        cleared = self.client.patch(url, {"trainer_id": None}, format="json")
        self.assertEqual(cleared.status_code, 200)
        self.assertIsNone(cleared.data["trainer"])

    def test_all_plan_assignment_endpoints_respect_trainer_scope(self):
        self.client.force_authenticate(self.trainer)
        for kind, plan_model, assignment_model in [
            ("workout", WorkoutPlan, WorkoutAssignment),
            ("diet", DietPlan, DietAssignment),
            ("supplement", SupplementPlan, SupplementAssignment),
        ]:
            with self.subTest(kind=kind):
                plan = plan_model.objects.create(name="Shared plan")
                # The current trainer scope governs even historically assigned plans.
                hidden = assignment_model.objects.create(user=self.other_member, plan=plan, assigned_by=self.trainer)
                assign_url = f"/api/{kind}-plans/{plan.pk}/assign/"
                list_url = f"/api/{kind}-assignments/"
                hidden_url = f"{list_url}{hidden.pk}/"
                self.assertEqual(self.client.post(assign_url, {"user": self.other_member.pk}).status_code, 400)
                self.assertEqual(self.client.post(assign_url, {"user": self.unassigned.pk}).status_code, 400)
                created = self.client.post(assign_url, {"user": self.member.pk})
                self.assertEqual(created.status_code, 201)
                results = self.client.get(list_url, {"plan": plan.pk}).data["results"]
                self.assertEqual([result["id"] for result in results], [created.data["id"]])
                self.assertEqual(self.client.get(list_url, {"user": self.other_member.pk}).data["count"], 0)
                self.assertEqual(self.client.get(hidden_url).status_code, 404)
                self.assertEqual(self.client.patch(hidden_url, {"status": "completed"}).status_code, 404)
                self.assertEqual(self.client.delete(hidden_url).status_code, 404)


class EnsureAdminCommandTests(TestCase):
    """The container makes the gym's first admin with this on every start
    (docker/entrypoint.sh), so the second run has to be harmless."""

    def _run(self, **options):
        options = {
            "username": "owner",
            "national_id": "۰۰۱۲۳۴۵۶۷۸",
            "password": "Gym-owner-2026",
            **options,
        }
        call_command("ensure_admin", stdout=io.StringIO(), **options)

    def test_makes_an_admin_for_the_panel_and_the_admin_site(self):
        self._run()
        owner = User.objects.get(username="owner")
        self.assertEqual(owner.role, User.Role.ADMIN)
        self.assertTrue(owner.is_staff and owner.is_superuser)
        self.assertEqual(owner.national_id, "0012345678")
        self.assertTrue(owner.check_password("Gym-owner-2026"))

    def test_an_existing_username_is_left_alone(self):
        self._run()
        self._run(password="Another-password-2027")
        self.assertTrue(User.objects.get(username="owner").check_password("Gym-owner-2026"))

    def test_staff_password_rules_apply(self):
        with self.assertRaises(CommandError):
            self._run(password="1234")
        self.assertFalse(User.objects.filter(username="owner").exists())

    def test_the_national_id_is_checked(self):
        with self.assertRaises(CommandError):
            self._run(national_id="12345")
        member = make_user(User.Role.MEMBER, "member")
        User.objects.filter(pk=member.pk).update(national_id="0012345678")
        with self.assertRaises(CommandError):
            self._run()  # someone else's ID
        self.assertFalse(User.objects.filter(username="owner").exists())
