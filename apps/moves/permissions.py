from rest_framework.permissions import SAFE_METHODS, BasePermission


class IsTrainerOrAdminOrReadOnly(BasePermission):
    """
    Any authenticated user (including members) can VIEW moves and their
    media — that's the whole point, members need to see how to do them.
    Only trainers/admins can create, edit, or delete.
    """

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in SAFE_METHODS:
            return True
        return request.user.is_trainer or request.user.is_gym_admin
