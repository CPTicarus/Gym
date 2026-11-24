import ctypes
import shutil
import sys
from contextlib import suppress
from pathlib import Path

from django.conf import settings
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsAdmin

LOW_DISK_BYTES = 5 * 1024**3
HIGH_MEMORY_PERCENT = 85
LINUX_MEMINFO = Path("/proc/meminfo")
LINUX_CGROUPS = Path("/proc/self/cgroup")
LINUX_CGROUP_ROOT = Path("/sys/fs/cgroup")


def _read_numbers(path):
    numbers = {}
    for line in path.read_text(encoding="ascii").splitlines():
        parts = line.split()
        if len(parts) >= 2:
            numbers[parts[0].rstrip(":")] = int(parts[1])
    return numbers


def _cgroup_memory_readings():
    with suppress(OSError):
        for line in LINUX_CGROUPS.read_text(encoding="utf-8", errors="surrogateescape").splitlines():
            fields = line.split(":", 2)
            if len(fields) != 3:
                continue
            _, controllers, name = fields
            relative_path = Path(name.lstrip("/"))
            if relative_path.is_absolute() or ".." in relative_path.parts:
                continue
            if not controllers:
                root = LINUX_CGROUP_ROOT
                limit_name, usage_name, cache_name = "memory.max", "memory.current", "inactive_file"
            elif "memory" in controllers.split(","):
                root = LINUX_CGROUP_ROOT / "memory"
                limit_name = "memory.limit_in_bytes"
                usage_name, cache_name = "memory.usage_in_bytes", "total_inactive_file"
            else:
                continue

            # A process is subject to limits on its own cgroup and its ancestors.
            path = root / relative_path
            for group in (path, *path.parents):
                if not group.is_relative_to(root):
                    break
                with suppress(OSError, ValueError):
                    limit = int((group / limit_name).read_text(encoding="ascii"))
                    # The v1 unlimited sentinel is close to 2**63; v2 uses "max".
                    if not 0 < limit < 2**60:
                        continue
                    usage = int((group / usage_name).read_text(encoding="ascii"))
                    cache = 0
                    with suppress(OSError, ValueError):
                        cache = _read_numbers(group / "memory.stat").get(cache_name, 0)
                    yield limit, max(0, limit - max(0, usage - cache))


def _linux_memory():
    readings = list(_cgroup_memory_readings())
    with suppress(OSError, ValueError, KeyError):
        values = _read_numbers(LINUX_MEMINFO)
        if values["MemTotal"] > 0:
            readings.append((values["MemTotal"] * 1024, values["MemAvailable"] * 1024))
    if readings:
        total = min(total for total, _ in readings)
        available = min(available for _, available in readings)
        return total, min(total, max(0, available))
    return None


class _WindowsMemoryStatus(ctypes.Structure):
    _fields_ = [
        ("length", ctypes.c_uint32),
        ("load", ctypes.c_uint32),
        ("total_physical", ctypes.c_uint64),
        ("available_physical", ctypes.c_uint64),
        ("total_page_file", ctypes.c_uint64),
        ("available_page_file", ctypes.c_uint64),
        ("total_virtual", ctypes.c_uint64),
        ("available_virtual", ctypes.c_uint64),
        ("available_extended_virtual", ctypes.c_uint64),
    ]


def _read_memory():
    if sys.platform.startswith("linux"):
        return _linux_memory()
    if sys.platform == "win32":
        status = _WindowsMemoryStatus(length=ctypes.sizeof(_WindowsMemoryStatus))
        with suppress(OSError, AttributeError):
            if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)) and status.total_physical:
                return status.total_physical, status.available_physical
    return None


def _read_storage():
    volume = getattr(settings, "DATA_DIR", settings.BASE_DIR)
    with suppress(OSError):
        usage = shutil.disk_usage(volume)
        if usage.total > 0:
            return usage.total, usage.free
    return None


def _usage(total, available, available_key):
    return {
        "total_bytes": total,
        available_key: available,
        "used_percent": round(100 * (total - available) / total, 1),
    }


def get_system_resources():
    memory_reading = _read_memory()
    storage_reading = _read_storage()
    memory = disk = None
    memory_high = storage_low = False

    if memory_reading is not None:
        total, available = memory_reading
        memory = _usage(total, available, "available_bytes")
        memory_high = 100 * (total - available) >= HIGH_MEMORY_PERCENT * total
    if storage_reading is not None:
        total, free = storage_reading
        disk = _usage(total, free, "free_bytes")
        storage_low = free < LOW_DISK_BYTES

    if memory_high or storage_low:
        status = "upgrade_recommended"
    else:
        status = "healthy" if memory is not None and disk is not None else "unknown"
    return {
        "memory": memory,
        "disk": disk,
        "memory_high": memory_high,
        "storage_low": storage_low,
        "status": status,
    }


class SystemResourcesView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        return Response(get_system_resources(), headers={"Cache-Control": "private, no-store"})
