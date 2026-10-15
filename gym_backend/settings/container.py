"""
Settings for the all-in-one Docker image (Dockerfile, docker/).

One image serves every gym, so whatever differs between them comes from
environment variables -- the container's env file -- and never from a
file baked into the image. The defaults describe the container's own
layout: Postgres on a Unix socket next door, Nginx in front of gunicorn,
and everything that has to survive an upgrade under /data.
"""
from pathlib import Path

from decouple import Csv, config
from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F401,F403
from .base import REST_FRAMEWORK

DEBUG = False

# The one volume: database, uploads, the generated secret key, backups.
DATA_DIR = Path(config("DATA_DIR", default="/data"))


def _secret_key():
    """SECRET_KEY from the environment when it's set, otherwise the key the
    entrypoint generated on first start and keeps in the data volume. So no
    deployment has to invent one, and it stays put across upgrades -- a new
    key would invalidate every login token in circulation."""
    key = config("SECRET_KEY", default="")
    if key:
        return key
    try:
        return (DATA_DIR / "secret_key").read_text().strip()
    except OSError as exc:
        raise ImproperlyConfigured(
            "Set SECRET_KEY, or let the container's entrypoint generate one."
        ) from exc


SECRET_KEY = _secret_key()

# "*" by default so a fresh install answers on whatever it's reached by --
# often a bare IP before there's a domain. Set the real names once there
# are some. localhost is always in, for the container's own health check.
ALLOWED_HOSTS = [*config("ALLOWED_HOSTS", default="*", cast=Csv()), "localhost", "127.0.0.1"]
CSRF_TRUSTED_ORIGINS = config("CSRF_TRUSTED_ORIGINS", default="", cast=Csv())

# The frontend is served from the same origin as the API, so there are no
# cross-origin callers to let in.
CORS_ALLOWED_ORIGINS = config("CORS_ALLOWED_ORIGINS", default="", cast=Csv())

# Peer authentication over the socket: the OS user gunicorn runs as IS the
# database role, so there's no password to set, leak or rotate, and
# Postgres doesn't listen on the network at all.
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": config("DB_NAME", default="gym"),
        "USER": config("DB_USER", default="gym"),
        "PASSWORD": config("DB_PASSWORD", default=""),
        "HOST": config("DB_HOST", default="/run/postgresql"),
        "PORT": config("DB_PORT", default=""),
        "CONN_MAX_AGE": 60,
        "CONN_HEALTH_CHECKS": True,
    }
}

# The throttles count in the cache, and the count has to be shared by every
# gunicorn worker: with the default per-process cache each worker keeps its
# own, multiplying the login allowance that stands between an attacker and
# a 4-digit member PIN (apps/accounts/throttling.py). The database is
# shared, and already here.
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.db.DatabaseCache",
        "LOCATION": "django_cache",
    }
}

MEDIA_ROOT = DATA_DIR / "media"
PRIVATE_MEDIA_ROOT = DATA_DIR / "private_media"
# STATIC_ROOT stays as in base.py: collected into the image when it's built.

# Nginx is the only way in, and it reports the scheme the browser used and
# the address it came from (docker/nginx/proxy.conf). Without these, Django
# would build http:// links to uploads on an https site, and DRF would see
# every visitor as 127.0.0.1 -- one sign-up allowance for the whole
# internet. NUM_PROXIES=1 makes DRF take the address Nginx vouches for,
# rather than whatever a client wrote into X-Forwarded-For itself.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
REST_FRAMEWORK = {**REST_FRAMEWORK, "NUM_PROXIES": 1}

# Set by the entrypoint when it finds a certificate, or by hand when TLS
# ends at a proxy in front of the container. The admin's cookies then
# never travel over plain http.
HTTPS = config("HTTPS", default=False, cast=bool)
SESSION_COOKIE_SECURE = HTTPS
CSRF_COOKIE_SECURE = HTTPS

# Into the container log (`docker logs`). Django's own default sends server
# errors nowhere once DEBUG is off -- only by email to ADMINS, and there
# are none.
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "plain": {"format": "%(asctime)s [%(levelname)s] %(name)s: %(message)s"},
    },
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "plain"},
    },
    "root": {"handlers": ["console"], "level": "WARNING"},
    "loggers": {
        # Every 4xx is a warning by default, and an expired login token
        # alone makes one per page. Errors are what's worth reading here.
        "django.request": {"level": "ERROR"},
    },
}
