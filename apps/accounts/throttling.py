from rest_framework.throttling import SimpleRateThrottle


class LoginRateThrottle(SimpleRateThrottle):
    """Rate-limits login attempts per ACCOUNT rather than per IP address.

    Per-IP is the obvious choice and the wrong one for a gym. Members log
    in from the gym's own WiFi, so they share a single public address:
    an IP limit would throttle the whole floor at busy times while barely
    inconveniencing an attacker, who can rotate addresses. The thing that
    actually needs limiting is repeated guesses against one username —
    which is precisely the exposure created by letting members use a
    4-digit PIN (see apps/accounts/passwords.py).

    Falls back to the client address when no username is supplied, so a
    flood of malformed requests still meets a limit.

    Counting happens in the cache, which defaults to per-process memory —
    with several workers the effective allowance multiplies. Point CACHES
    at a shared backend before scaling out.
    """

    scope = "login"

    def get_cache_key(self, request, view):
        username = ""
        if isinstance(request.data, dict):
            username = str(request.data.get("username") or "").strip().lower()
        return self.cache_format % {
            "scope": self.scope,
            "ident": username or self.get_ident(request),
        }
