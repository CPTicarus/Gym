import hashlib
import os
import re
import secrets
import stat
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

from django.conf import settings
from django.db import transaction
from django.http import FileResponse, HttpResponse
from django.utils import timezone
from django.utils.http import content_disposition_header
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed, NotFound, PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from apps.accounts.models import User
from apps.accounts.permissions import IsAdmin

from .models import BackupDownloadTicket

BACKUP_PATTERNS = {
    "database": re.compile(r"gym-db-([0-9]{8}-[0-9]{6})\.dump"),
    "full": re.compile(r"gym-full-([0-9]{8}-[0-9]{6})\.tar\.gz"),
}
BACKUP_TICKET_TTL = timedelta(minutes=1)
TICKET_PATTERN = re.compile(r"[A-Za-z0-9_-]{43}")


@dataclass(frozen=True)
class Backup:
    path: Path
    size_bytes: int
    created_at: datetime

    def metadata(self):
        return {"name": self.path.name, "size_bytes": self.size_bytes, "created_at": self.created_at}


def backup_at_path(kind, path):
    pattern = BACKUP_PATTERNS.get(kind)
    match = pattern.fullmatch(path.name) if pattern else None
    if not match:
        return None
    try:
        created_at = datetime.strptime(match[1], "%Y%m%d-%H%M%S").replace(tzinfo=UTC)
        info = path.lstat()
    except (OSError, ValueError):
        return None
    if stat.S_ISREG(info.st_mode) and info.st_size > 0:
        return Backup(path, info.st_size, created_at)
    return None


def latest_backups():
    directory = Path(settings.BACKUP_DIR)
    latest = dict.fromkeys(BACKUP_PATTERNS)
    try:
        for path in directory.iterdir():
            kind = "database" if path.name.startswith("gym-db-") else "full"
            backup = backup_at_path(kind, path)
            current = latest[kind]
            if backup and (current is None or backup.created_at > current.created_at):
                latest[kind] = backup
    except (FileNotFoundError, NotADirectoryError):
        pass
    return latest


def latest_backup(kind):
    backup = latest_backups().get(kind)
    if backup is None:
        raise NotFound("No completed backup is available for this type.")
    return backup


def ticket_digest(token):
    return hashlib.sha256(token.encode("ascii")).hexdigest()


def active_ticket_queryset():
    return BackupDownloadTicket.objects.filter(
        expires_at__gt=timezone.now(), user__is_active=True, user__role=User.Role.ADMIN,
    )


class BackupTicketAuthentication(BaseAuthentication):
    def authenticate(self, request):
        if request.method != "POST":
            return None
        data = request.data
        token = data.get("ticket") if hasattr(data, "get") else None
        if not isinstance(token, str) or not TICKET_PATTERN.fullmatch(token):
            raise AuthenticationFailed("The backup download ticket is invalid or expired.")
        ticket = active_ticket_queryset().select_related("user").filter(pk=ticket_digest(token)).first()
        if ticket is None:
            raise AuthenticationFailed("The backup download ticket is invalid or expired.")
        return ticket.user, ticket


class BackupAdminView(APIView):
    permission_classes = [IsAdmin]

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response["Cache-Control"] = "private, no-store"
        return response


class BackupListView(BackupAdminView):
    def get(self, request):
        return Response({kind: backup.metadata() if backup else None for kind, backup in latest_backups().items()})


class BackupDownloadTicketView(BackupAdminView):
    def post(self, request, kind):
        backup = latest_backup(kind)
        token = secrets.token_urlsafe(32)
        now = timezone.now()
        with transaction.atomic():
            BackupDownloadTicket.objects.filter(expires_at__lte=now).delete()
            BackupDownloadTicket.objects.create(
                digest=ticket_digest(token), user=request.user, kind=kind, file_name=backup.path.name,
                expires_at=now + BACKUP_TICKET_TTL,
            )
        return Response({"ticket": token})


class BackupDownloadView(BackupAdminView):
    authentication_classes = [JWTAuthentication, BackupTicketAuthentication]

    def get(self, request, kind):
        return backup_response(latest_backup(kind))

    def post(self, request, kind):
        ticket = request.auth
        if not isinstance(ticket, BackupDownloadTicket) or ticket.kind != kind:
            raise PermissionDenied("The ticket does not authorize this backup.")
        # The name was selected at issue time. Match the requested type before
        # resolving it so redemption cannot choose a path or a newer archive.
        pattern = BACKUP_PATTERNS.get(kind)
        if not pattern or not pattern.fullmatch(ticket.file_name):
            raise NotFound("This backup is no longer available.")
        backup = backup_at_path(kind, Path(settings.BACKUP_DIR) / ticket.file_name)
        if backup is None:
            raise NotFound("This backup is no longer available.")
        removed, _ = active_ticket_queryset().filter(pk=ticket.pk).delete()
        if not removed:
            raise AuthenticationFailed("The backup download ticket is invalid or expired.")
        return backup_response(backup)


def backup_response(backup):
    if settings.BACKUP_ACCEL_REDIRECT:
        response = HttpResponse(content_type="application/octet-stream")
        response["X-Accel-Redirect"] = f"{settings.BACKUP_ACCEL_REDIRECT}{backup.path.name}"
        response["Content-Disposition"] = content_disposition_header(True, backup.path.name)
    else:
        try:
            archive = open_backup_file(backup.path)
        except OSError as exc:
            raise NotFound("This backup is no longer available.") from exc
        response = FileResponse(archive, as_attachment=True, filename=backup.path.name, content_type="application/octet-stream")
        response["X-Accel-Buffering"] = "no"
    response["X-Content-Type-Options"] = "nosniff"
    return response


def open_backup_file(path):
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_BINARY", 0) | getattr(os, "O_NONBLOCK", 0)
    descriptor = os.open(path, flags)
    try:
        info = os.fstat(descriptor)
        if not stat.S_ISREG(info.st_mode) or not info.st_size:
            raise NotFound("This backup is no longer available.")
        return os.fdopen(descriptor, "rb")
    except BaseException:
        os.close(descriptor)
        raise
