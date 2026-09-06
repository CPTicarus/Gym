"""
Password rules, which are deliberately not the same for everyone.

A member can reach exactly one thing: their own profile, their own weight
log, and whatever plan has been assigned to them. They can't see another
member, can't touch billing, can't change anything about the gym. Against
that, an 8-character password with mixed rules buys very little — and
costs a phone call to the front desk every time someone forgets it. So
members get a short minimum length and nothing else; a 4-digit PIN is a
perfectly reasonable member password.

Staff are a different matter. A trainer sees every member's data, an admin
can change roles and memberships, accounting sees billing. Those accounts
keep Django's full AUTH_PASSWORD_VALIDATORS.

The rule is attached to the ROLE, not to which endpoint created the
account, so a member is held to the same bar however they were made.
"""
from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from .models import User


def validate_password_for_role(password, role, user=None):
    """Apply the policy for `role`, raising DRF's ValidationError keyed to
    the password field so it surfaces on the right input in a form."""
    if role == User.Role.MEMBER:
        minimum = settings.MEMBER_PASSWORD_MIN_LENGTH
        if len(password or "") < minimum:
            raise serializers.ValidationError(
                {"password": [f"Password must be at least {minimum} characters."]}
            )
        # Nothing else on purpose: the common-password and numeric-only
        # validators exist to reject exactly the sort of password this is
        # meant to permit.
        return

    try:
        validate_password(password, user=user)
    except DjangoValidationError as exc:
        raise serializers.ValidationError({"password": list(exc.messages)})
