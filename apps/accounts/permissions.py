from rest_framework import status
from rest_framework.exceptions import APIException
from rest_framework.permissions import SAFE_METHODS, BasePermission

from .models import User
from .signup import self_signup_enabled


def visible_members(user):
    """Members a staff account can access through the API."""
    members = User.objects.filter(role=User.Role.MEMBER)
    if user and user.is_authenticated and user.is_active:
        if user.is_trainer:
            return members.filter(trainer=user)
        if user.is_gym_admin or user.is_accounting:
            return members
    return members.none()


class IsAdmin(BasePermission):
    message = "Only gym admins can perform this action."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_gym_admin)


class IsTrainer(BasePermission):
    message = "Only active trainers can perform this action."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_active and user.is_trainer)


class IsTrainerOrAdmin(BasePermission):
    message = "Only trainers or admins can perform this action."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and (request.user.is_trainer or request.user.is_gym_admin)
        )


class IsAccounting(BasePermission):
    message = "Only accounting staff can perform this action."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_accounting)


class IsStaff(BasePermission):
    """Any staff role — trainer, admin, or accounting (not a plain member).
    Used for the shared staff dashboard (the user directory), where every
    staff role needs to get in the door but see different amounts of data
    (scoped in the view's get_queryset, not here)."""

    message = "Only staff accounts can perform this action."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and (request.user.is_trainer or request.user.is_gym_admin or request.user.is_accounting)
        )


class IsAdminOrAccounting(BasePermission):
    message = "Only admins or accounting staff can perform this action."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and (request.user.is_gym_admin or request.user.is_accounting)
        )


class IsOwnerOrStaff(BasePermission):
    """
    Object-level permission for things like profiles, workout assignments, etc:
    - the owner can always read/edit their own object
    - staff can read objects belonging to members in their scope
    - only admin can WRITE to someone else's object

    Combine with IsAuthenticated at the view level; this only checks the object.
    """

    def has_object_permission(self, request, view, obj):
        user = request.user
        if not user or not user.is_authenticated:
            return False

        is_owner = obj == user or getattr(obj, "user", None) == user
        if is_owner:
            return True

        if request.method in SAFE_METHODS:
            target = obj if isinstance(obj, User) else getattr(obj, "user", None)
            return user.is_gym_admin or (
                isinstance(target, User) and visible_members(user).filter(pk=target.pk).exists()
            )

        return user.is_gym_admin


def can_manage_user(actor, target):
    """Whether `actor` may edit `target`'s profile or set their password.

    One rule, used by both, because "who may change this person's details"
    and "who may change this person's password" are the same question.

      admin       everyone except OTHER admins — an admin can always edit
                  themselves, but not a peer. Admins are the people who can
                  hand out roles, so letting one quietly take over another's
                  account (by resetting its password) would make the
                  restriction on creating admins pointless.
      accounting  members only. They run the front desk, so member records
                  are their job; trainer and admin accounts are not.
      anyone else no. Trainers read the directory, they don't edit it.
    """
    if not (actor and actor.is_authenticated):
        return False
    if actor.is_gym_admin:
        return target.pk == actor.pk or not target.is_gym_admin
    if actor.is_accounting:
        return target.is_member
    return False


class CanManageUser(BasePermission):
    """Object-level companion to can_manage_user, for the user directory's
    write actions."""

    message = "You are not allowed to modify this account."

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return True
        return can_manage_user(request.user, obj)


class SelfSignupOpen(BasePermission):
    """The public sign-up door, open only in a gym that takes self sign-ups
    (see apps/accounts/signup.py). Everywhere else the front desk makes
    member accounts, and anyone who finds the endpoint gets a 403."""

    message = "Self sign-up is closed: this gym creates member accounts at the front desk."

    def has_permission(self, request, view):
        return self_signup_enabled()


class PaymentRequired(APIException):
    status_code = status.HTTP_402_PAYMENT_REQUIRED
    default_detail = "Your plans unlock once your payment has been recorded."
    default_code = "payment_required"


class PlansUnlocked(BasePermission):
    """Holds a member's plans back until they've paid, in a self sign-up
    gym (User.plans_locked). Goes on every member endpoint that returns a
    plan or acts on one.

    Raises a 402 instead of returning False, which DRF would turn into a
    403 like every other refusal. The app has to tell "you haven't paid"
    apart from "you may not", because only the first gets the page that
    says how to unlock them.
    """

    def has_permission(self, request, view):
        if request.user.is_authenticated and request.user.plans_locked:
            raise PaymentRequired()
        return True
