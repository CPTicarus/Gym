from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import viewsets
from rest_framework.filters import SearchFilter
from rest_framework.generics import get_object_or_404
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser

from .models import Move, MoveMedia
from .permissions import IsTrainerOrAdminOrReadOnly
from .serializers import MoveListSerializer, MoveMediaSerializer, MoveSerializer


class MoveViewSet(viewsets.ModelViewSet):
    """
    GET    /api/moves/            any authenticated user
    POST   /api/moves/            trainer/admin
    GET    /api/moves/{id}/       any authenticated user
    PATCH  /api/moves/{id}/       trainer/admin
    DELETE /api/moves/{id}/       trainer/admin

    Filter/search:
      ?category=chest&difficulty=beginner
      ?search=press
    """

    queryset = Move.objects.all().select_related("created_by").prefetch_related("media")
    permission_classes = [IsTrainerOrAdminOrReadOnly]
    filter_backends = [DjangoFilterBackend, SearchFilter]
    filterset_fields = ["category", "difficulty"]
    search_fields = ["name", "alias", "description"]

    def get_serializer_class(self):
        return MoveListSerializer if self.action == "list" else MoveSerializer

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class MoveMediaViewSet(viewsets.ModelViewSet):
    """
    Nested under a move — image/video uploads for demonstrating it.

      GET    /api/moves/{move_pk}/media/
      POST   /api/moves/{move_pk}/media/
      PATCH  /api/moves/{move_pk}/media/{id}/
      DELETE /api/moves/{move_pk}/media/{id}/

    Reuses the same read-open / write-restricted rule as moves themselves.
    """

    serializer_class = MoveMediaSerializer
    permission_classes = [IsTrainerOrAdminOrReadOnly]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        return MoveMedia.objects.filter(move_id=self.kwargs["move_pk"])

    def perform_create(self, serializer):
        move = get_object_or_404(Move, pk=self.kwargs["move_pk"])
        serializer.save(move=move)
