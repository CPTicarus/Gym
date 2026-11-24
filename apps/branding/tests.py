from datetime import timedelta
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from unittest.mock import patch
from urllib.parse import urlencode

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from . import system_resources
from .models import BackupDownloadTicket, GymBranding


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


class BackupDownloadTests(APITestCase):
    url = "/api/config/backups/"
    database_name = "gym-db-20261124-120000.dump"
    full_name = "gym-full-20261124-100000.tar.gz"

    def setUp(self):
        self.directory = Path(self.enterContext(TemporaryDirectory()))
        self.enterContext(override_settings(BACKUP_DIR=self.directory, BACKUP_ACCEL_REDIRECT=None))
        self.admin = get_user_model().objects.create(username="backupadmin", national_id="0012345678", role="admin")
        (self.directory / self.database_name).write_bytes(b"latest database")
        (self.directory / self.full_name).write_bytes(b"server archive")

    def issue(self, kind="database"):
        self.client.force_authenticate(self.admin)
        response = self.client.post(f"{self.url}{kind}/download-ticket/")
        self.assertEqual(response.status_code, 200, response.data)
        self.client.force_authenticate(None)
        return response.data["ticket"]

    def redeem(self, token, kind="database"):
        return self.client.post(
            f"{self.url}{kind}/download/",
            urlencode({"ticket": token}),
            content_type="application/x-www-form-urlencoded",
        )

    def test_only_admins_can_list_or_request_backups(self):
        self.assertEqual(self.client.get(self.url).status_code, 401)
        self.assertEqual(self.client.get(f"{self.url}database/download/").status_code, 401)
        self.assertEqual(self.client.post(f"{self.url}database/download-ticket/").status_code, 401)
        for i, role in enumerate(("member", "trainer", "accounting"), start=1):
            with self.subTest(role=role):
                user = get_user_model().objects.create(username=role, national_id=str(i), role=role)
                self.client.force_authenticate(user)
                self.assertEqual(self.client.get(self.url).status_code, 403)
                self.assertEqual(self.client.get(f"{self.url}database/download/").status_code, 403)
                self.assertEqual(self.client.post(f"{self.url}database/download-ticket/").status_code, 403)
        self.assertFalse(BackupDownloadTicket.objects.exists())

    def test_list_selects_latest_completed_backup_by_creation_stamp(self):
        (self.directory / "gym-db-20261123-230000.dump").write_bytes(b"older snapshot")
        (self.directory / "gym-db-20261125-120000.dump.part").write_bytes(b"part")
        (self.directory / "gym-db-20261126-120000.dump").mkdir()
        (self.directory / "gym-db-20261127-120000.dump").touch()
        (self.directory / "gym-db-20261232-180000.dump").write_bytes(b"invalid date")
        self.client.force_authenticate(self.admin)
        response = self.client.get(self.url)
        self.assertEqual(response["Cache-Control"], "private, no-store")
        self.assertEqual(response.json(), {
            "database": {"name": self.database_name, "size_bytes": 15, "created_at": "2026-11-24T12:00:00Z"},
            "full": {"name": self.full_name, "size_bytes": 14, "created_at": "2026-11-24T10:00:00Z"},
        })

    def test_symlinks_are_not_backups(self):
        link = self.directory / "gym-db-20261125-120000.dump"
        try:
            link.symlink_to(self.directory / self.full_name)
        except OSError:
            self.skipTest("Creating symlinks is unavailable")
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get(self.url).data["database"]["name"], self.database_name)

    def test_ticket_streams_the_selected_file_once(self):
        token = self.issue()
        (self.directory / "gym-db-20261125-120000.dump").write_bytes(b"newer snapshot")
        self.assertEqual(self.redeem(token, kind="full").status_code, 403)
        response = self.redeem(token)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Disposition"], f'attachment; filename="{self.database_name}"')
        self.assertEqual(response["Cache-Control"], "private, no-store")
        self.assertEqual(b"".join(response.streaming_content), b"latest database")
        self.assertEqual(self.redeem(token).status_code, 401)

    def test_tickets_expire_and_are_revoked_when_admin_is_deactivated(self):
        token = self.issue()
        BackupDownloadTicket.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self.redeem(token).status_code, 401)
        token = self.issue()
        self.assertEqual(BackupDownloadTicket.objects.count(), 1)
        get_user_model().objects.filter(pk=self.admin.pk).update(is_active=False)
        self.assertEqual(self.redeem(token).status_code, 401)

    @override_settings(BACKUP_ACCEL_REDIRECT="/internal/gym-backups/")
    def test_production_offloads_to_private_nginx_location(self):
        response = self.redeem(self.issue("full"), kind="full")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.streaming)
        self.assertEqual(response["X-Accel-Redirect"], f"/internal/gym-backups/{self.full_name}")
        self.assertEqual(response["Content-Disposition"], f'attachment; filename="{self.full_name}"')
        self.assertEqual(response["Cache-Control"], "private, no-store")


class SystemResourcesTests(SimpleTestCase):
    def test_recommendation_checks_exact_resource_thresholds(self):
        limit = system_resources.LOW_DISK_BYTES
        cases = (
            ((1000, 151), (2 * limit, limit), "healthy", False, False),
            ((1000, 150), (2 * limit, limit), "upgrade_recommended", True, False),
            ((1000, 200), (2 * limit, limit - 1), "upgrade_recommended", False, True),
            (None, (2 * limit, limit), "unknown", False, False),
            (None, (2 * limit, limit - 1), "upgrade_recommended", False, True),
            (None, None, "unknown", False, False),
        )
        for memory, disk, status, memory_high, storage_low in cases:
            with self.subTest(memory=memory, disk=disk):
                with (
                    patch.object(system_resources, "_read_memory", return_value=memory),
                    patch.object(system_resources, "_read_storage", return_value=disk),
                ):
                    result = system_resources.get_system_resources()
                self.assertEqual(result["status"], status)
                self.assertEqual(result["memory_high"], memory_high)
                self.assertEqual(result["storage_low"], storage_low)

    @override_settings(DATA_DIR="/gym-persistent-data")
    def test_reads_disk_from_the_gym_volume(self):
        with patch.object(
            system_resources.shutil, "disk_usage", return_value=SimpleNamespace(total=100, free=40),
        ) as disk_usage:
            self.assertEqual(system_resources._read_storage(), (100, 40))
            disk_usage.assert_called_once_with("/gym-persistent-data")

    def test_linux_memory_accounts_for_ancestor_limit_and_reclaimable_cache(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            host = root / "meminfo"
            host.write_text("MemTotal: 16777216 kB\nMemAvailable: 8388608 kB\n", encoding="ascii")
            memberships = root / "memberships"
            memberships.write_text("0::/parent/child\n", encoding="ascii")
            cgroups = root / "cgroups"
            parent = cgroups / "parent"
            child = parent / "child"
            child.mkdir(parents=True)
            gibibyte = 1024**3
            for group, limit, usage, cache in (
                (parent, 4 * gibibyte, 4 * gibibyte, gibibyte // 2),
                (child, 2 * gibibyte, gibibyte, 0),
            ):
                (group / "memory.max").write_text(str(limit), encoding="ascii")
                (group / "memory.current").write_text(str(usage), encoding="ascii")
                (group / "memory.stat").write_text(f"inactive_file {cache}\n", encoding="ascii")
            with patch.multiple(
                system_resources, LINUX_MEMINFO=host, LINUX_CGROUPS=memberships, LINUX_CGROUP_ROOT=cgroups,
            ):
                self.assertEqual(system_resources._linux_memory(), (2 * gibibyte, gibibyte // 2))

    def test_linux_v1_memory_ignores_an_unlimited_group(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            memberships = root / "memberships"
            memberships.write_text("5:memory:/docker\n", encoding="ascii")
            group = root / "memory" / "docker"
            group.mkdir(parents=True)
            limit = group / "memory.limit_in_bytes"
            limit.write_text(str(2**63 - 4096), encoding="ascii")
            with patch.multiple(system_resources, LINUX_CGROUPS=memberships, LINUX_CGROUP_ROOT=root):
                self.assertEqual(list(system_resources._cgroup_memory_readings()), [])
                limit.write_text("1000", encoding="ascii")
                (group / "memory.usage_in_bytes").write_text("950", encoding="ascii")
                (group / "memory.stat").write_text("total_inactive_file 100\n", encoding="ascii")
                self.assertEqual(list(system_resources._cgroup_memory_readings()), [(1000, 150)])


class SystemResourcesPermissionsTests(APITestCase):
    def test_only_admins_can_read_server_resource_status(self):
        url = "/api/config/system-resources/"
        self.assertEqual(self.client.get(url).status_code, 401)
        for index, role in enumerate(("member", "trainer", "accounting", "admin"), 1):
            with self.subTest(role=role):
                user = get_user_model().objects.create(username=role, national_id=str(index), role=role)
                self.client.force_authenticate(user)
                with (
                    patch.object(system_resources, "_read_memory", return_value=(100, 40)),
                    patch.object(system_resources, "_read_storage", return_value=(10 * 1024**3, 5 * 1024**3)),
                ):
                    response = self.client.get(url)
                self.assertEqual(response.status_code, 200 if role == "admin" else 403)
                if role == "admin":
                    self.assertEqual(response["Cache-Control"], "private, no-store")
                    self.assertEqual(response.data["memory"], {
                        "total_bytes": 100, "available_bytes": 40, "used_percent": 60.0,
                    })
                    self.assertEqual(response.data["disk"]["free_bytes"], 5 * 1024**3)
