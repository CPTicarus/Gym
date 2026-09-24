import importlib

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase
from rest_framework import status
from rest_framework.test import APITestCase

from .models import AllowedFood, DietItem, DietPlan, Food

User = get_user_model()


def make_user(role, username):
    return User.objects.create_user(
        username=username, password="pass-1234-long", role=role, national_id=f"{abs(hash(username)) % 10**10:010d}"
    )


class FoodLibraryTests(APITestCase):
    def setUp(self):
        self.trainer = make_user(User.Role.TRAINER, "trainer")
        self.member = make_user(User.Role.MEMBER, "member")
        self.chicken = Food.objects.create(name="سینه مرغ", unit="g", serving_size=100, calories=165, protein_g=31)

    def test_members_read_but_only_staff_write(self):
        self.client.force_authenticate(self.member)
        self.assertEqual(self.client.get("/api/foods/").status_code, status.HTTP_200_OK)
        self.assertEqual(
            self.client.post("/api/foods/", {"name": "x"}).status_code, status.HTTP_403_FORBIDDEN
        )

        self.client.force_authenticate(self.trainer)
        response = self.client.post(
            "/api/foods/", {"name": "تخم مرغ", "unit": "piece", "serving_size": 1, "calories": 70}
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Food.objects.get(pk=response.data["id"]).created_by, self.trainer)

    def test_serving_size_must_be_positive(self):
        self.client.force_authenticate(self.trainer)
        response = self.client.post("/api/foods/", {"name": "x", "serving_size": 0})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("serving_size", response.data)

    def test_page_size_param_returns_the_whole_library(self):
        Food.objects.bulk_create(Food(name=f"food {i}") for i in range(30))
        self.client.force_authenticate(self.trainer)
        self.assertEqual(len(self.client.get("/api/foods/").data["results"]), 20)
        self.assertEqual(len(self.client.get("/api/foods/?page_size=1000").data["results"]), 31)

    def _put_in_plan(self, name="plan"):
        plan = DietPlan.objects.create(name=name)
        day = plan.days.create(day_of_week=0)
        meal = day.meals.create(name="ناهار")
        DietItem.objects.create(meal=meal, food=self.chicken, amount=200)
        return plan

    def test_unit_is_locked_once_a_plan_uses_the_food(self):
        self.client.force_authenticate(self.trainer)
        url = f"/api/foods/{self.chicken.pk}/"
        # Free to change while nothing depends on it...
        self.assertEqual(self.client.patch(url, {"unit": "ml"}).status_code, status.HTTP_200_OK)
        self.client.patch(url, {"unit": "g"})

        self._put_in_plan()
        response = self.client.patch(url, {"unit": "piece"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("unit", response.data)
        # ...and the numbers stay editable — fixing them is the point.
        self.assertEqual(self.client.patch(url, {"protein_g": 30}).status_code, status.HTTP_200_OK)

    def test_delete_is_refused_while_in_use_and_names_the_plans(self):
        self._put_in_plan("رژیم کاهش وزن")
        self.client.force_authenticate(self.trainer)
        response = self.client.delete(f"/api/foods/{self.chicken.pk}/")
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data["plans"], ["رژیم کاهش وزن"])

        unused = Food.objects.create(name="unused")
        self.assertEqual(
            self.client.delete(f"/api/foods/{unused.pk}/").status_code, status.HTTP_204_NO_CONTENT
        )


class DietPlanKindTests(APITestCase):
    def setUp(self):
        self.trainer = make_user(User.Role.TRAINER, "trainer")
        self.member = make_user(User.Role.MEMBER, "member")
        self.client.force_authenticate(self.trainer)
        self.rice = Food.objects.create(name="برنج", unit="g", serving_size=100, calories=130)
        self.egg = Food.objects.create(name="تخم مرغ", unit="piece", serving_size=1, calories=70)

    def test_weekly_plan_starts_with_seven_days_of_three_meals(self):
        response = self.client.post("/api/diet-plans/", {"name": "w", "kind": "weekly"})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        plan = DietPlan.objects.get(pk=response.data["id"])
        self.assertEqual(plan.days.count(), 7)
        self.assertEqual([d.meals.count() for d in plan.days.all()], [3] * 7)

    def test_kind_defaults_to_weekly(self):
        response = self.client.post("/api/diet-plans/", {"name": "w"})
        self.assertEqual(response.data["kind"], "weekly")
        self.assertEqual(len(response.data["days"]), 7)

    def test_allowed_plan_starts_blank(self):
        response = self.client.post("/api/diet-plans/", {"name": "a", "kind": "allowed"})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["days"], [])
        self.assertEqual(response.data["allowed_foods"], [])

    def test_kind_cannot_change_after_creation(self):
        plan = DietPlan.objects.create(name="a", kind="allowed")
        response = self.client.patch(f"/api/diet-plans/{plan.pk}/", {"kind": "weekly"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        # Resending the same kind (a full form submit) is fine.
        response = self.client.patch(f"/api/diet-plans/{plan.pk}/", {"kind": "allowed", "name": "b"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_item_takes_a_food_and_an_amount(self):
        plan = self.client.post("/api/diet-plans/", {"name": "w"}).data
        meal_id = plan["days"][0]["meals"][0]["id"]
        url = f"/api/diet-plans/{plan['id']}/meals/{meal_id}/items/"

        self.assertEqual(
            self.client.post(url, {"food": self.rice.pk, "amount": 0}).status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        response = self.client.post(url, {"food": self.rice.pk, "amount": 150, "notes": "پخته"})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        detail = self.client.get(f"/api/diet-plans/{plan['id']}/").data
        item = detail["days"][0]["meals"][0]["items"][0]
        self.assertEqual(item["amount"], 150)
        # The whole food rides along, so the client can scale it.
        self.assertEqual(item["food_detail"]["calories"], 130)
        self.assertEqual(item["food_detail"]["serving_size"], 100)

    def test_allowed_foods_only_on_allowed_plans_and_only_once(self):
        weekly = DietPlan.objects.create(name="w", kind="weekly")
        response = self.client.post(f"/api/diet-plans/{weekly.pk}/allowed-foods/", {"food": self.egg.pk})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        allowed = DietPlan.objects.create(name="a", kind="allowed")
        url = f"/api/diet-plans/{allowed.pk}/allowed-foods/"
        first = self.client.post(url, {"food": self.egg.pk})
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertIsNone(first.data["amount"])  # optional on this kind of plan

        repeat = self.client.post(url, {"food": self.egg.pk, "amount": 2})
        self.assertEqual(repeat.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("food", repeat.data)

        # Editing an entry in place isn't a "repeat" of itself.
        edit = self.client.patch(f"{url}{first.data['id']}/", {"food": self.egg.pk, "amount": 2})
        self.assertEqual(edit.status_code, status.HTTP_200_OK)

    def test_duplicate_copies_foods_amounts_and_kind(self):
        weekly = self.client.post("/api/diet-plans/", {"name": "w"}).data
        meal_id = weekly["days"][2]["meals"][1]["id"]
        self.client.post(
            f"/api/diet-plans/{weekly['id']}/meals/{meal_id}/items/",
            {"food": self.rice.pk, "amount": 180, "notes": "کته"},
        )
        copy = self.client.post(f"/api/diet-plans/{weekly['id']}/duplicate/").data
        items = [i for d in copy["days"] for m in d["meals"] for i in m["items"]]
        self.assertEqual(
            [(i["food"], i["amount"], i["notes"]) for i in items], [(self.rice.pk, 180, "کته")]
        )
        self.assertEqual(sum(len(d["meals"]) for d in copy["days"]), 21)  # no default meals on top

        allowed = DietPlan.objects.create(name="a", kind="allowed")
        AllowedFood.objects.create(plan=allowed, food=self.egg, amount=2, notes="در روز")
        copy = self.client.post(f"/api/diet-plans/{allowed.pk}/duplicate/").data
        self.assertEqual(copy["kind"], "allowed")
        self.assertEqual(copy["days"], [])
        self.assertEqual(
            [(e["food"], e["amount"], e["notes"]) for e in copy["allowed_foods"]],
            [(self.egg.pk, 2, "در روز")],
        )

    def test_member_sees_foods_nested_in_their_plan(self):
        allowed = DietPlan.objects.create(name="a", kind="allowed")
        AllowedFood.objects.create(plan=allowed, food=self.egg)
        self.client.post(f"/api/diet-plans/{allowed.pk}/assign/", {"user": self.member.pk})

        self.client.force_authenticate(self.member)
        results = self.client.get("/api/my-diet-plans/").data["results"]
        entry = results[0]["plan_detail"]["allowed_foods"][0]
        self.assertEqual(entry["food_detail"]["name"], "تخم مرغ")


class QuantityParsingTests(SimpleTestCase):
    """The free-text quantities 0006 turned into amounts + units."""

    parse = staticmethod(
        importlib.import_module("apps.diet.migrations.0006_diet_items_to_food_library").parse_quantity
    )

    def test_reads_the_common_shapes(self):
        cases = {
            "۱۵۰ گرم": (150.0, "g", ""),
            "150g": (150.0, "g", ""),
            "۲ عدد متوسط": (2.0, "piece", "متوسط"),
            "۱٫۵ لیوان": (1.5, "cup", ""),
            "۱/۲ لیوان": (0.5, "cup", ""),
            "نصف لیوان": (0.5, "cup", ""),
            "لیوان": (1.0, "cup", ""),
            "۲ قاشق غذاخوری": (2.0, "tbsp", ""),
            "۲۰۰ سی‌سی": (200.0, "ml", ""),
        }
        for text, expected in cases.items():
            with self.subTest(text=text):
                self.assertEqual(self.parse(text), expected)

    def test_gives_up_rather_than_guessing(self):
        for text in ["", "۱ کف دست", "به میزان دلخواه", "۱۵۰ گرمی", "0 گرم"]:
            with self.subTest(text=text):
                self.assertIsNone(self.parse(text))
