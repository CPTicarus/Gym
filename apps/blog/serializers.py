from rest_framework import serializers

from .models import Post


class _PostBaseSerializer(serializers.ModelSerializer):
    """Shared computed fields for both the list and detail shapes."""

    author_name = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()

    def get_author_name(self, obj):
        if not obj.author:
            return ""
        return obj.author.get_full_name() or obj.author.username

    def get_can_edit(self, obj):
        """Mirrors IsAuthorOrAdminOrReadOnly so the frontend can show an
        edit button exactly where a PATCH would actually succeed, instead
        of re-deriving the rule (and drifting from it)."""
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if not (user and user.is_authenticated):
            return False
        return obj.author_id == user.id or user.is_gym_admin


class PostListSerializer(_PostBaseSerializer):
    """Lightweight — the feed shows a cover, a title and a teaser, not the
    whole article body."""

    class Meta:
        model = Post
        fields = [
            "id", "title", "summary", "category", "cover_image",
            "status", "published_at", "author_name", "can_edit", "created_at",
        ]


class PostSerializer(_PostBaseSerializer):
    """Full article, for reading one post and for the write form."""

    class Meta:
        model = Post
        fields = [
            "id", "title", "summary", "content", "category", "cover_image",
            "status", "published_at", "author_name", "can_edit",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "published_at", "created_at", "updated_at"]
