from django.db import transaction
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsAdmin

from .models import GymBranding
from .serializers import BrandingSerializer


class BrandingView(APIView):
    permission_classes = [IsAdmin]

    def patch(self, request):
        serializer = BrandingSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        # Two admins can change different labels or colors without losing either edit.
        with transaction.atomic():
            settings, _ = GymBranding.objects.select_for_update().get_or_create(pk=1)
            overrides = settings.overrides
            for key, value in serializer.validated_data.items():
                if key in ("light_colors", "dark_colors"):
                    colors = {**overrides.get(key, {}), **value}
                    value = {token: color for token, color in colors.items() if color is not None} or None
                if value is None:
                    overrides.pop(key, None)
                else:
                    overrides[key] = value
            settings.save(update_fields=["overrides"])
        return Response(overrides)
