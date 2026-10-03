from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.workouts.models import DailyExercise, WarmupExercise, WorkoutDay, WorkoutDayExercise, WorkoutPlan

from .models import Move, MoveMedia

User = get_user_model()


def make_user(role, username):
    return User.objects.create_user(
        username=username, password="pass-1234-long", role=role, national_id=f"{abs(hash(username)) % 10**10:010d}"
    )


class MoveLibraryTests(APITestCase):
    def test_whole_library_in_one_request(self):
        """The library page and the plan builder both filter the whole list
        in the browser; the page used to show only the first 20."""
        Move.objects.bulk_create(Move(name=f"move {n}") for n in range(35))
        member = User.objects.create_user(
            username="member", password="pass-1234-long", role=User.Role.MEMBER, national_id="0000000001"
        )
        self.client.force_authenticate(member)
        self.assertEqual(len(self.client.get("/api/moves/").data["results"]), 20)
        everything = self.client.get("/api/moves/?page_size=1000").data
        self.assertEqual((len(everything["results"]), everything["next"]), (35, None))


class MoveEditAndDeleteTests(APITestCase):
    """Trainers and admins edit and remove moves. A move that a workout plan
    still uses is refused with the plans named, not a 500."""

    def setUp(self):
        self.client.force_authenticate(make_user(User.Role.TRAINER, "coach"))
        self.move = Move.objects.create(name="Bench press")
        self.url = f"/api/moves/{self.move.pk}/"

    def test_trainer_edits_a_move(self):
        response = self.client.patch(self.url, {"name": "Incline bench", "category": "chest"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.move.refresh_from_db()
        self.assertEqual((self.move.name, self.move.category), ("Incline bench", "chest"))

    def test_an_unused_move_goes_with_its_media(self):
        MoveMedia.objects.create(move=self.move, external_url="https://example.com/bench")
        self.assertEqual(self.client.delete(self.url).status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Move.objects.filter(pk=self.move.pk).exists())
        self.assertFalse(MoveMedia.objects.exists())

    def test_a_move_in_use_is_refused_and_the_plans_named(self):
        push = WorkoutPlan.objects.create(name="Push")
        pull = WorkoutPlan.objects.create(name="Pull")
        WorkoutPlan.objects.create(name="Legs")  # doesn't use it
        WarmupExercise.objects.create(plan=push, move=self.move)
        day = WorkoutDay.objects.create(plan=pull, name="Day 1")
        WorkoutDayExercise.objects.create(day=day, move=self.move)
        DailyExercise.objects.create(plan=pull, move=self.move)

        response = self.client.delete(self.url)
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data["plans"], ["Pull", "Push"])  # each once, by name
        self.assertTrue(Move.objects.filter(pk=self.move.pk).exists())

    def test_admins_can_too_but_members_and_accounting_cannot(self):
        for role, name in ((User.Role.MEMBER, "member"), (User.Role.ACCOUNTING, "desk")):
            self.client.force_authenticate(make_user(role, name))
            self.assertEqual(self.client.patch(self.url, {"name": "x"}).status_code, status.HTTP_403_FORBIDDEN)
            self.assertEqual(self.client.delete(self.url).status_code, status.HTTP_403_FORBIDDEN)
        self.client.force_authenticate(make_user(User.Role.ADMIN, "boss"))
        self.assertEqual(self.client.delete(self.url).status_code, status.HTTP_204_NO_CONTENT)
