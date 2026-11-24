from rest_framework import serializers

from .models import GymBranding


COLOR_TOKENS = {
    "canvas", "surface", "ink", "muted", "line", "neutral-soft",
    "accent", "accent-ink", "accent-dark", "accent-soft",
    "chrome", "chrome-ink", "success", "success-soft", "danger", "danger-soft",
}


class PaletteField(serializers.DictField):
    child = serializers.RegexField(r"^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?\Z", allow_null=True)

    def to_internal_value(self, data):
        colors = super().to_internal_value(data)
        if colors.keys() - COLOR_TOKENS:
            raise serializers.ValidationError("Unknown palette color.")
        return colors


def lines_field():
    return serializers.ListField(
        child=serializers.CharField(max_length=200), max_length=40, allow_null=True
    )


class BrandingSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=80, allow_null=True)
    tagline = serializers.CharField(max_length=160, allow_blank=True, allow_null=True)
    note = serializers.CharField(max_length=240, allow_blank=True, allow_null=True)
    ticker = lines_field()
    greetings = lines_field()
    scheme = serializers.ChoiceField(choices=["original", "ocean", "forest"], allow_null=True)
    light_colors = PaletteField()
    dark_colors = PaletteField()

    def validate(self, attrs):
        if self.initial_data.keys() - self.fields.keys():
            raise serializers.ValidationError("Unknown branding setting.")
        return attrs


class ChatMediaSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = GymBranding
        fields = ["chat_media_max_size_mb", "chat_media_retention_days"]

    def validate(self, attrs):
        if self.initial_data.keys() - self.fields.keys():
            raise serializers.ValidationError("Unknown chat media setting.")
        return attrs
