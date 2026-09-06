from django.db.models import Q
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import viewsets
from rest_framework.filters import SearchFilter
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser

from .models import Post
from .permissions import IsAuthorOrAdminOrReadOnly
from .serializers import PostListSerializer, PostSerializer


class PostViewSet(viewsets.ModelViewSet):
    """
    GET    /api/blog-posts/           any authenticated user (published only)
    POST   /api/blog-posts/           trainer/admin
    GET    /api/blog-posts/{id}/      any authenticated user (published only)
    PATCH  /api/blog-posts/{id}/      the author, or an admin
    DELETE /api/blog-posts/{id}/      the author, or an admin

    Filter/search:
      ?category=nutrition&status=published
      ?search=protein
    """

    permission_classes = [IsAuthorOrAdminOrReadOnly]
    # Posts can carry a cover image, so the write form may arrive as
    # multipart; without a cover it's plain JSON.
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    filter_backends = [DjangoFilterBackend, SearchFilter]
    filterset_fields = ["category", "status"]
    search_fields = ["title", "summary", "content"]

    def get_queryset(self):
        """Draft posts are only visible to the person writing them (and to
        admins, who can edit anything anyway). Everyone else — members,
        accounting, other trainers — sees the published feed."""
        user = self.request.user
        posts = Post.objects.select_related("author")
        if user.is_gym_admin:
            return posts
        if user.is_trainer:
            return posts.filter(Q(status=Post.Status.PUBLISHED) | Q(author=user))
        return posts.filter(status=Post.Status.PUBLISHED)

    def get_serializer_class(self):
        return PostListSerializer if self.action == "list" else PostSerializer

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)
