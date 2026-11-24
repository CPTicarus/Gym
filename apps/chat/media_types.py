import os
import shutil
import subprocess
from pathlib import Path

from PIL import Image, UnidentifiedImageError

HEADER_BYTES = 256 * 1024
VIDEO_APPLICATION_TYPES = {"application/mxf", "application/vnd.rn-realmedia"}


def file_command():
    command = shutil.which("file")
    if command is None and os.name == "nt":
        git = shutil.which("git")
        if git:
            # Git for Windows ships file and its signature database outside PATH.
            bundled_file = Path(git).parent.parent / "usr" / "bin" / "file.exe"
            if bundled_file.is_file():
                command = str(bundled_file)
    return command


def detect_media_type(upload):
    """Check the uploaded bytes independently of browser MIME types and suffixes."""
    try:
        command = file_command()
        if command:
            try:
                result = subprocess.run(
                    [command, "--brief", "--mime-type", "-"],
                    input=upload.read(HEADER_BYTES),
                    capture_output=True,
                    check=True,
                    timeout=5,
                )
                mime = result.stdout.decode("ascii", errors="replace").strip()
                if mime.startswith(("image/", "video/")) or mime in VIDEO_APPLICATION_TYPES:
                    return mime
            except (OSError, subprocess.SubprocessError):
                pass

        upload.seek(0)
        try:
            with Image.open(upload) as image:
                return image.get_format_mimetype()
        except (UnidentifiedImageError, Image.DecompressionBombError, OSError, ValueError):
            return None
    finally:
        upload.seek(0)
