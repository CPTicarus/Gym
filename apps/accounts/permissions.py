from rest_framework.permissions import SAFE_METHODS, BasePermission


class IsAdmin(BasePermission):
    message = "Only gym admins can perform this action."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_gym_admin)


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
    - trainer/admin/accounting can READ any object (SAFE_METHODS)
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
            return user.is_trainer or user.is_gym_admin or user.is_accounting

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
