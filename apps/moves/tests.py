from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from .models import Move

User = get_user_model()


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
