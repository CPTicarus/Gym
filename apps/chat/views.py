from django.db import transaction
from django.db.models import BigIntegerField, Exists, F, OuterRef, Subquery
from django.db.models.functions import Coalesce
from django.http import FileResponse, Http404, QueryDict
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.branding.models import GymBranding

from .models import ChatAttachment, ChatMessage, ChatReadState, delete_private_file
from .serializers import (
    ChatCursorSerializer,
    ChatMessageInputSerializer,
    ChatMessageSerializer,
    ChatMessageSummarySerializer,
    ChatReadSerializer,
)

MESSAGE_PAGE_SIZE = 50


def active_chat_members():
    return User.objects.filter(
        role=User.Role.MEMBER,
        is_active=True,
        trainer__role=User.Role.TRAINER,
        trainer__is_active=True,
    )


def chat_participants(user, partner_id, *, lock_member=False):
    member_id, trainer_id = (user.pk, partner_id) if user.is_member else (partner_id, user.pk)
    members = active_chat_members().only("pk")
    if lock_member:
        # Serialize sends and read acknowledgements in this thread so a later
        # ID cannot commit ahead of an earlier one and move the cursor past it.
        members = members.select_for_update(of=("self",))
    get_object_or_404(members, pk=member_id, trainer_id=trainer_id)
    return {"member_id": member_id, "trainer_id": trainer_id}


def chat_policy():
    media = GymBranding.chat_media_settings()
    return {
        "max_size_mb": media["chat_media_max_size_mb"],
        "retention_days": media["chat_media_retention_days"],
    }


def chat_read_field(user):
    return "member_read_through" if user.is_member else "trainer_read_through"


def chat_inbox(user):
    if user.is_member:
        partners = User.available_trainers().filter(
            trainees__pk=user.pk,
            trainees__role=User.Role.MEMBER,
            trainees__is_active=True,
        )
        participants = {"member_id": user.pk, "trainer_id": OuterRef("pk")}
    else:
        partners = active_chat_members().filter(trainer=user)
        participants = {"member_id": OuterRef("pk"), "trainer_id": user.pk}

    messages = ChatMessage.objects.filter(**participants)
    read_through = ChatReadState.objects.filter(**participants).values(chat_read_field(user))
    partners = partners.alias(read_through=Coalesce(Subquery(read_through), 0, output_field=BigIntegerField()))
    incoming = messages.exclude(sender=user)
    partners = partners.annotate(unread=Exists(incoming.filter(pk__gt=OuterRef("read_through"))))
    return partners, messages


class IsChatParticipant(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return user.is_authenticated and user.is_active and (user.is_member or user.is_trainer)


class ChatView(APIView):
    permission_classes = [IsChatParticipant]

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response["Cache-Control"] = "private, no-store"
        return response


class ChatConversationsView(ChatView):
    def get(self, request):
        partners, messages = chat_inbox(request.user)
        conversations = list(partners.annotate(
            last_message_id=Subquery(messages.order_by("-pk").values("pk")[:1]),
        ).order_by(F("last_message_id").desc(nulls_last=True), "first_name", "last_name", "pk").values(
            "id", "first_name", "last_name", "username", "role", "last_message_id", "unread",
        ))
        message_ids = [row["last_message_id"] for row in conversations if row["last_message_id"]]
        messages = ChatMessage.objects.in_bulk(message_ids)
        for conversation in conversations:
            message = messages.get(conversation.pop("last_message_id"))
            conversation["last_message"] = ChatMessageSummarySerializer(message).data if message else None
        return Response(conversations)


class ChatUnreadView(ChatView):
    def get(self, request):
        partners, _ = chat_inbox(request.user)
        return Response({"unread": partners.filter(unread=True).exists()})


class ChatReadView(ChatView):
    def post(self, request, partner_id):
        serializer = ChatReadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        through_id = serializer.validated_data["through_id"]

        with transaction.atomic():
            participants = chat_participants(request.user, partner_id, lock_member=True)
            thread = ChatMessage.objects.filter(**participants)
            get_object_or_404(thread.only("pk"), pk=through_id)
            state, _ = ChatReadState.objects.get_or_create(**participants)
            field = chat_read_field(request.user)
            read_through = getattr(state, field)
            if through_id > read_through:
                setattr(state, field, through_id)
                state.save(update_fields=[field])
                read_through = through_id
            unread = thread.filter(pk__gt=read_through).exclude(sender=request.user).exists()
        return Response({"unread": unread})


class ChatMessagesView(ChatView):
    def get(self, request, partner_id):
        thread = ChatMessage.objects.filter(**chat_participants(request.user, partner_id))
        cursor = ChatCursorSerializer(data=request.query_params)
        cursor.is_valid(raise_exception=True)
        before = cursor.validated_data.get("before")
        after = cursor.validated_data.get("after")
        messages = thread.prefetch_related("attachments")
        has_older = False
        has_newer = False
        if after is not None:
            page = list(messages.filter(pk__gt=after).order_by("pk")[: MESSAGE_PAGE_SIZE + 1])
            has_newer = len(page) > MESSAGE_PAGE_SIZE
            has_older = after > 0 and thread.filter(pk__lte=after).exists()
            page = page[:MESSAGE_PAGE_SIZE]
        else:
            if before is not None:
                messages = messages.filter(pk__lt=before)
                has_newer = thread.filter(pk__gte=before).exists()
            page = list(messages.order_by("-pk")[: MESSAGE_PAGE_SIZE + 1])
            has_older = len(page) > MESSAGE_PAGE_SIZE
            page = list(reversed(page[:MESSAGE_PAGE_SIZE]))
        policy = chat_policy()
        serializer = ChatMessageSerializer(page, many=True, context={**policy, "now": timezone.now()})
        return Response({**policy, "results": serializer.data, "has_older": has_older, "has_newer": has_newer})

    def post(self, request, partner_id):
        chat_participants(request.user, partner_id)
        policy = chat_policy()
        data = request.data
        if isinstance(data, QueryDict):
            data = data.dict()
            uploads = request.FILES.getlist("attachments")
            if uploads:
                data["attachments"] = uploads
        serializer = ChatMessageInputSerializer(data=data, context=policy)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data

        stored_files = []
        try:
            with transaction.atomic():
                participants = chat_participants(request.user, partner_id, lock_member=True)
                message = ChatMessage.objects.create(
                    **participants, sender=request.user, text=validated.get("text", ""),
                )
                for upload, content_type in zip(validated.get("attachments", []), validated["content_types"]):
                    attachment = ChatAttachment(
                        message=message, name=upload.name, size=upload.size, content_type=content_type,
                    )
                    field = attachment.file.field
                    storage = field.storage
                    name = field.generate_filename(attachment, upload.name)
                    # Record the target before writing in case a storage error leaves a partial file.
                    stored_files.append((storage, name))
                    saved_name = storage.save(name, upload, max_length=field.max_length)
                    stored_files[-1] = (storage, saved_name)
                    attachment.file = saved_name
                    attachment.save()
        except Exception:
            # The database rolls back the rows. File storage needs its own cleanup.
            for storage, name in stored_files:
                delete_private_file(storage, name)
            raise

        output = ChatMessageSerializer(message, context={**policy, "now": timezone.now()})
        return Response(output.data, status=status.HTTP_201_CREATED)


class ChatAttachmentFileView(ChatView):
    def get(self, request, pk):
        user = request.user
        owner = {"message__member_id" if user.is_member else "message__trainer_id": user.pk}
        attachment = get_object_or_404(ChatAttachment.objects.select_related("message"), pk=pk, **owner)
        partner_id = attachment.message.trainer_id if user.is_member else attachment.message.member_id
        chat_participants(user, partner_id)
        if attachment.is_expired(chat_policy()["retention_days"], timezone.now()):
            raise Http404
        try:
            file = attachment.file.open("rb")
        except FileNotFoundError as exc:
            raise Http404 from exc

        response = FileResponse(file, as_attachment=True, filename=attachment.name, content_type=attachment.content_type)
        response["Content-Security-Policy"] = "default-src 'none'; sandbox"
        response["X-Content-Type-Options"] = "nosniff"
        return response
