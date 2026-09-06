from rest_framework.permissions import SAFE_METHODS, BasePermission


class IsAuthorOrAdminOrReadOnly(BasePermission):
    """
    Any authenticated user can READ posts — that's the point, the blog is
    for the members. Only trainers/admins can write one, and a post can
    only be edited or deleted by whoever wrote it (or by an admin), so one
    trainer can't rewrite another's article.

    Draft visibility isn't handled here — a draft simply isn't in the
    queryset for anyone but its author and admins (see PostViewSet).
    """

    message = "Only the author or an admin can change this post."

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in SAFE_METHODS:
            return True
        return request.user.is_trainer or request.user.is_gym_admin

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return True
        return obj.author_id == request.user.id or request.user.is_gym_admin
