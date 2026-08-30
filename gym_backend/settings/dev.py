from .base import *  # noqa: F401,F403

DEBUG = True

# SQLite so `runserver` works immediately with zero setup. Swap to Postgres
# any time by pointing DJANGO_SETTINGS_MODULE at settings.prod instead.
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",  # noqa: F405
    }
}
