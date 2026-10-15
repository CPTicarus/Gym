"""
`manage.py ensure_admin` -- the gym's first admin account, if it isn't there.

`createsuperuser` isn't enough on its own for this app: it makes a Django
superuser whose app role is still "member", with no national ID, so they
land in the member pages rather than the panel. This makes the account the
way the panel makes any admin (role admin, national ID, the staff password
rules) and also lets them into /admin/, since whoever sets a gym up is its
site operator too.

It does nothing when the username is already taken -- never touching that
account's password or role -- so the container runs it on every start
(docker/entrypoint.sh) from ADMIN_USERNAME / ADMIN_NATIONAL_ID /
ADMIN_PASSWORD, and it's safe to run by hand:

    docker exec -it gym manage ensure_admin --username owner --national-id 0012345678
"""
import getpass
import os
import sys

from django.core.management.base import BaseCommand, CommandError
from rest_framework import serializers

from apps.accounts.models import User, normalize_digits
from apps.accounts.passwords import validate_password_for_role
from apps.accounts.serializers import NATIONAL_ID_LENGTH


class Command(BaseCommand):
    help = "Create an admin account (role admin, Django superuser) unless the username exists."

    def add_arguments(self, parser):
        parser.add_argument("--username", required=True)
        parser.add_argument("--national-id", required=True)
        parser.add_argument("--first-name", default="")
        parser.add_argument("--last-name", default="")
        parser.add_argument(
            "--password",
            help="Defaults to the ADMIN_PASSWORD environment variable, then asks.",
        )

    def handle(self, *args, **options):
        username = options["username"].strip()
        if User.objects.filter(username=username).exists():
            self.stdout.write(f"User {username!r} already exists; leaving it as it is.")
            return

        national_id = normalize_digits(options["national_id"]).strip()
        if not national_id.isdigit() or len(national_id) != NATIONAL_ID_LENGTH:
            raise CommandError(f"National ID must be exactly {NATIONAL_ID_LENGTH} digits.")
        if User.objects.filter(national_id=national_id).exists():
            raise CommandError("Another account already has that national ID.")

        user = User(
            username=username,
            national_id=national_id,
            first_name=options["first_name"],
            last_name=options["last_name"],
            role=User.Role.ADMIN,
            is_staff=True,
            is_superuser=True,
        )
        password = options["password"] or os.environ.get("ADMIN_PASSWORD") or self.ask_password()
        try:
            validate_password_for_role(password, user.role, user=user)
        except serializers.ValidationError as exc:
            raise CommandError(" ".join(exc.detail["password"])) from exc

        user.set_password(password)
        user.save()
        self.stdout.write(self.style.SUCCESS(f"Created admin {username!r}."))

    def ask_password(self):
        if not sys.stdin.isatty():
            raise CommandError("Pass --password, or set ADMIN_PASSWORD.")
        password = getpass.getpass("Password: ")
        if password != getpass.getpass("Password (again): "):
            raise CommandError("The passwords don't match.")
        return password
