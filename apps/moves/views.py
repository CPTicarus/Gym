from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.filters import SearchFilter
from rest_framework.generics import get_object_or_404
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from .models import Move, MoveMedia, media_size_limits
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

    @action(detail=False, url_path="media-limits")
    def media_limits(self, request):
        """The upload caps, so the form can warn and block using the very
        numbers the server enforces instead of a second copy that drifts.

        Sizes are bytes because that's what `File.size` gives the browser —
        no unit conversion on either side of the wire.
        """
        return Response(media_size_limits())


class MoveMediaViewSet(viewsets.ModelViewSet):
    """
    Nested under a move — image/video uploads for demonstrating it.

      GET    /api/moves/{move_pk}/media/
      POST   /api/moves/{move_pk}/media/
      PATCH  /api/moves/{move_pk}/media/{id}/
      DELETE /api/moves/{move_pk}/media/{id}/
      POST   /api/moves/{move_pk}/media/reorder/

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

    @action(detail=False, methods=["post"])
    def reorder(self, request, move_pk=None):
        """Rewrite the display order of a move's media in one call.

        Body: {"order": [<media_id>, ...]} — every one of the move's media
        ids, listed in the order they should appear. All of them, because
        `order` is a position within the whole list: renumbering a subset
        would silently collide with the items left out. One request rather
        than a PATCH per item so a reorder can't half-apply.
        """
        ids = request.data.get("order")
        if not isinstance(ids, list) or not ids:
            raise ValidationError({"order": "Provide a list of media ids in the new order."})

        media = {item.id: item for item in self.get_queryset()}
        if sorted(ids) != sorted(media):
            raise ValidationError(
                {"order": "Provide every media id belonging to this move, exactly once."}
            )

        for position, media_id in enumerate(ids):
            media[media_id].order = position
        MoveMedia.objects.bulk_update(media.values(), ["order"])

        ordered = sorted(media.values(), key=lambda item: item.order)
        return Response(self.get_serializer(ordered, many=True).data)
