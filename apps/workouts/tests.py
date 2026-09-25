from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.moves.models import Move

from .models import Superset, WorkoutDay, WorkoutDayExercise, WorkoutPlan

User = get_user_model()


def make_user(role, username):
    return User.objects.create_user(
        username=username, password="pass-1234-long", role=role, national_id=f"{abs(hash(username)) % 10**10:010d}"
    )


class SupersetTests(APITestCase):
    def setUp(self):
        self.trainer = make_user(User.Role.TRAINER, "trainer")
        self.client.force_authenticate(self.trainer)
        self.plan = WorkoutPlan.objects.create(name="Push")
        self.day = WorkoutDay.objects.create(plan=self.plan, name="Chest")
        self.bench, self.curl, self.raise_, self.fly = (
            Move.objects.create(name=name) for name in ["Bench press", "Barbell curl", "Front raise", "Fly"]
        )
        self.base = f"/api/workout-plans/{self.plan.pk}/days/{self.day.pk}"

    def _superset(self, moves=None, **extra):
        moves = moves or [
            {"move": self.bench.pk, "reps": 10},
            {"move": self.curl.pk, "reps": 15},
            {"move": self.raise_.pk, "reps": 12},
        ]
        return self.client.post(
            f"{self.base}/supersets/",
            {"name": "Chest superset", "sets": 4, "rest_seconds": 90, "exercises": moves, **extra},
            format="json",
        )

    def _day(self):
        return self.client.get(f"/api/workout-plans/{self.plan.pk}/").data["days"][0]

    def test_created_with_its_moves_after_the_days_exercises(self):
        WorkoutDayExercise.objects.create(day=self.day, move=self.fly, sets=3, reps=12, order=0)
        response = self._superset()
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        day = self._day()
        self.assertEqual(
            [(s["name"], s["sets"], s["rest_seconds"]) for s in day["supersets"]],
            [("Chest superset", 4, 90)],
        )
        superset_id = day["supersets"][0]["id"]
        # The user's example: bench 10, curl 15, raise 12 — in that order,
        # after the fly that was already there, with no sets of their own.
        self.assertEqual(
            [(e["move"], e["superset"], e["reps"], e["sets"]) for e in day["exercises"]],
            [
                (self.fly.pk, None, 12, 3),
                (self.bench.pk, superset_id, 10, None),
                (self.curl.pk, superset_id, 15, None),
                (self.raise_.pk, superset_id, 12, None),
            ],
        )

    def test_needs_at_least_two_moves_and_a_set_count(self):
        one_move = self._superset(moves=[{"move": self.bench.pk, "reps": 10}])
        self.assertEqual(one_move.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("exercises", one_move.data)

        no_sets = self.client.post(
            f"{self.base}/supersets/",
            {"exercises": [{"move": self.bench.pk}, {"move": self.curl.pk}]},
            format="json",
        )
        self.assertEqual(no_sets.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("sets", no_sets.data)

        both = self._superset(
            moves=[{"move": self.bench.pk, "reps": 10, "duration_seconds": 30}, {"move": self.curl.pk}]
        )
        self.assertEqual(both.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Superset.objects.count(), 0)
        self.assertEqual(WorkoutDayExercise.objects.count(), 0)

    def test_a_move_can_join_an_existing_superset(self):
        superset_id = self._superset().data["id"]
        url = f"{self.base}/exercises/"

        joined = self.client.post(url, {"move": self.fly.pk, "reps": 8, "superset": superset_id, "order": 9})
        self.assertEqual(joined.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Superset.objects.get(pk=superset_id).exercises.count(), 4)

        # Its sets are the superset's, so it can't bring its own...
        with_sets = self.client.post(url, {"move": self.fly.pk, "sets": 3, "superset": superset_id})
        self.assertEqual(with_sets.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("sets", with_sets.data)

        # ...and it can't join a superset on another day.
        other_day = WorkoutDay.objects.create(plan=self.plan, name="Back")
        elsewhere = self.client.post(
            f"/api/workout-plans/{self.plan.pk}/days/{other_day.pk}/exercises/",
            {"move": self.fly.pk, "superset": superset_id},
        )
        self.assertEqual(elsewhere.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("superset", elsewhere.data)

    def test_membership_is_fixed_but_the_move_is_editable(self):
        self._superset()
        member = WorkoutDayExercise.objects.filter(superset__isnull=False).first()
        url = f"{self.base}/exercises/{member.pk}/"
        self.assertEqual(
            self.client.patch(url, {"superset": None}, format="json").status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        response = self.client.patch(url, {"move": self.fly.pk, "reps": 20}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["superset"], member.superset_id)

    def test_down_to_one_move_it_becomes_a_normal_exercise(self):
        self._superset(moves=[{"move": self.bench.pk, "reps": 10}, {"move": self.curl.pk, "reps": 15}])
        curl = WorkoutDayExercise.objects.get(move=self.curl)
        self.client.delete(f"{self.base}/exercises/{curl.pk}/")

        self.assertEqual(Superset.objects.count(), 0)
        bench = WorkoutDayExercise.objects.get()
        # The round's numbers become the move's own, rather than vanishing.
        self.assertEqual((bench.superset_id, bench.sets, bench.reps, bench.rest_seconds), (None, 4, 10, 90))

    def test_three_moves_down_to_two_stays_a_superset(self):
        self._superset()
        raise_ = WorkoutDayExercise.objects.get(move=self.raise_)
        self.client.delete(f"{self.base}/exercises/{raise_.pk}/")
        self.assertEqual(Superset.objects.get().exercises.count(), 2)

    def test_editing_the_round_and_deleting_the_superset(self):
        superset_id = self._superset().data["id"]
        WorkoutDayExercise.objects.create(day=self.day, move=self.fly, order=10)
        url = f"{self.base}/supersets/{superset_id}/"

        response = self.client.patch(url, {"sets": 5, "rest_seconds": 60}, format="json")
        self.assertEqual((response.status_code, response.data["sets"]), (status.HTTP_200_OK, 5))
        sneaky = self.client.patch(url, {"exercises": [{"move": self.fly.pk}]}, format="json")
        self.assertEqual(sneaky.status_code, status.HTTP_400_BAD_REQUEST)

        self.assertEqual(self.client.delete(url).status_code, status.HTTP_204_NO_CONTENT)
        # Its moves go with it; the day's other exercise stays.
        self.assertEqual(list(WorkoutDayExercise.objects.values_list("move", flat=True)), [self.fly.pk])

    def test_duplicate_copies_supersets_into_the_copy(self):
        self._superset()
        copy = self.client.post(f"/api/workout-plans/{self.plan.pk}/duplicate/").data
        day = copy["days"][0]
        self.assertEqual([(s["sets"], s["rest_seconds"]) for s in day["supersets"]], [(4, 90)])
        copied_id = day["supersets"][0]["id"]
        self.assertNotEqual(copied_id, Superset.objects.filter(day=self.day).get().pk)
        self.assertEqual({e["superset"] for e in day["exercises"]}, {copied_id})

    def test_member_sees_supersets_on_the_active_day(self):
        self._superset()
        member = make_user(User.Role.MEMBER, "member")
        self.client.post(f"/api/workout-plans/{self.plan.pk}/assign/", {"user": member.pk})

        self.client.force_authenticate(member)
        assignment = self.client.get("/api/my-workout-plans/").data["results"][0]
        self.assertEqual(len(assignment["active_day"]["supersets"]), 1)
        self.assertEqual(len(assignment["plan_detail"]["days"][0]["exercises"]), 3)
