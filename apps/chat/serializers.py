from django.urls import reverse
from rest_framework import serializers

from .media_types import detect_media_type
from .models import (
    BYTES_PER_MB,
    MAX_ATTACHMENTS_PER_MESSAGE,
    MAX_CHAT_ATTACHMENT_BYTES,
    MAX_MESSAGE_LENGTH,
    ChatAttachment,
    ChatMessage,
    attachment_deadline,
)


class ChatMessageSummarySerializer(serializers.ModelSerializer):
    sender_id = serializers.IntegerField(read_only=True)

    class Meta:
        model = ChatMessage
        fields = ("id", "text", "sender_id", "created_at")


class ChatAttachmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChatAttachment
        fields = ("id", "name", "content_type", "size")

    def to_representation(self, attachment):
        data = super().to_representation(attachment)
        days = self.context["retention_days"]
        expired = attachment.is_expired(days, self.context["now"])
        deadline = attachment_deadline(attachment.message.created_at, days)
        data.update(
            expired=expired,
            deleted=attachment.deleted_at is not None,
            available_until=serializers.DateTimeField().to_representation(deadline),
            url=None if expired else reverse("chat-attachment-file", args=[attachment.pk]),
        )
        return data


class ChatMessageSerializer(ChatMessageSummarySerializer):
    attachments = ChatAttachmentSerializer(many=True, read_only=True)

    class Meta(ChatMessageSummarySerializer.Meta):
        fields = (*ChatMessageSummarySerializer.Meta.fields, "attachments")


class ChatMessageInputSerializer(serializers.Serializer):
    text = serializers.CharField(max_length=MAX_MESSAGE_LENGTH, required=False, allow_blank=True)
    attachments = serializers.ListField(
        child=serializers.FileField(max_length=255), max_length=MAX_ATTACHMENTS_PER_MESSAGE, required=False
    )

    def validate(self, attrs):
        uploads = attrs.get("attachments", [])
        if not attrs.get("text") and not uploads:
            raise serializers.ValidationError("Write a message or attach a photo or video.")
        max_mb = self.context["max_size_mb"]
        if sum(upload.size for upload in uploads) > MAX_CHAT_ATTACHMENT_BYTES:
            raise serializers.ValidationError({"attachments": "Attachments total more than 100 MB."})
        for upload in uploads:
            if upload.size > max_mb * BYTES_PER_MB:
                raise serializers.ValidationError({
                    "attachments": f"{upload.name} exceeds the {max_mb} MB per-file limit."
                })
        content_types = []
        for upload in uploads:
            content_type = detect_media_type(upload)
            if not content_type:
                raise serializers.ValidationError({
                    "attachments": f"{upload.name} could not be identified as a photo or video."
                })
            content_types.append(content_type)
        attrs["content_types"] = content_types
        return attrs


class ChatCursorSerializer(serializers.Serializer):
    before = serializers.IntegerField(min_value=1, max_value=2**63 - 1, required=False)
    after = serializers.IntegerField(min_value=0, max_value=2**63 - 1, required=False)

    def validate(self, attrs):
        if "before" in attrs and "after" in attrs:
            raise serializers.ValidationError("Choose one message cursor.")
        return attrs


class ChatReadSerializer(serializers.Serializer):
    through_id = serializers.IntegerField(min_value=1, max_value=2**63 - 1)
