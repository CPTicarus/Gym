from rest_framework import serializers

from .models import Move, MoveMedia


class MoveMediaSerializer(serializers.ModelSerializer):
    class Meta:
        model = MoveMedia
        fields = ["id", "media_type", "file", "external_url", "caption", "order"]
        read_only_fields = ["id"]

    def validate(self, attrs):
        # fall back to existing instance values on partial_update (PATCH)
        file = attrs.get("file", getattr(self.instance, "file", None))
        external_url = attrs.get("external_url", getattr(self.instance, "external_url", ""))

        if not file and not external_url:
            raise serializers.ValidationError("Provide either a file upload or an external_url.")
        if file and external_url:
            raise serializers.ValidationError("Provide only one of file or external_url, not both.")
        return attrs


class MoveListSerializer(serializers.ModelSerializer):
    """Lightweight — used for list views and for nesting a move reference
    inside workout-plan exercises later on."""

    class Meta:
        model = Move
        fields = ["id", "name", "category", "difficulty"]


class MoveSerializer(serializers.ModelSerializer):
    """Full detail — includes all media for showing users how to perform it."""

    media = MoveMediaSerializer(many=True, read_only=True)
    created_by = serializers.StringRelatedField(read_only=True)

    class Meta:
        model = Move
        fields = [
            "id", "name", "description", "category", "difficulty",
            "created_by", "media", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_by", "created_at", "updated_at"]
