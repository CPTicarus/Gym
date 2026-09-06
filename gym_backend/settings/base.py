"""
Settings shared by every environment. dev.py / prod.py import * from here
and only override what actually differs (DEBUG, DATABASES, etc).
"""
from datetime import timedelta
from pathlib import Path

from decouple import Csv, config

# gym_backend/settings/base.py -> up 3 levels = project root
BASE_DIR = Path(__file__).resolve().parent.parent.parent

SECRET_KEY = config("SECRET_KEY", default="dev-insecure-secret-key-change-me")
DEBUG = config("DEBUG", default=False, cast=bool)
ALLOWED_HOSTS = config("ALLOWED_HOSTS", default="localhost,127.0.0.1", cast=Csv())

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",

    # third-party
    "rest_framework",
    "rest_framework_simplejwt",
    "corsheaders",
    "django_filters",

    # local apps
    "apps.accounts",
    "apps.moves",
    "apps.workouts",
    "apps.diet",
    "apps.accounting",
    "apps.blog",
]

AUTH_USER_MODEL = "accounts.User"

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",  # must sit above CommonMiddleware
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "gym_backend.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "gym_backend.wsgi.application"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Upload size caps per media type, in megabytes (see apps/moves/models.py).
# "warn" only flags the file in the UI before it's added; "max" is refused
# outright, in the browser and again on the server. Every value is
# overridable from .env, so a gym on a small VPS can tighten them — or a
# gym with room to spare can loosen them — without a code change.
#
# Why these defaults:
#   image  a well-compressed demo photo is well under 2 MB, so that's the
#          nudge; the 8 MB cap is a backstop against accidents (a RAW
#          export, an uncropped screenshot), not a storage budget — a
#          straight-from-the-phone photo should still go through.
#   gif    an animated loop is many frames, so it is legitimately far
#          bigger than a still. Judging it by the image cap would reject
#          most genuinely useful exercise GIFs.
#   video  deliberately tight: this app's stance is that real video should
#          be linked externally rather than hosted here (see MoveMedia),
#          and these numbers keep pointing people that way.
MEDIA_SIZE_LIMITS_MB = {
    "image": {
        "warn": config("MEDIA_WARN_IMAGE_MB", default=2, cast=float),
        "max": config("MEDIA_MAX_IMAGE_MB", default=8, cast=float),
    },
    "gif": {
        "warn": config("MEDIA_WARN_GIF_MB", default=5, cast=float),
        "max": config("MEDIA_MAX_GIF_MB", default=15, cast=float),
    },
    "video": {
        "warn": config("MEDIA_WARN_VIDEO_MB", default=10, cast=float),
        "max": config("MEDIA_MAX_VIDEO_MB", default=50, cast=float),
    },
}

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
    ],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=30),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
}

CORS_ALLOWED_ORIGINS = config(
    "CORS_ALLOWED_ORIGINS",
    default="http://localhost:5173,http://127.0.0.1:5173",
    cast=Csv(),
)
