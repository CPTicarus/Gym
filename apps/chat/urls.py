from django.urls import path

from .views import ChatAttachmentFileView, ChatConversationsView, ChatMessagesView, ChatReadView, ChatUnreadView

urlpatterns = [
    path("conversations/", ChatConversationsView.as_view(), name="chat-conversations"),
    path("conversations/<int:partner_id>/messages/", ChatMessagesView.as_view(), name="chat-messages"),
    path("conversations/<int:partner_id>/read/", ChatReadView.as_view(), name="chat-read"),
    path("unread/", ChatUnreadView.as_view(), name="chat-unread"),
    path("attachments/<int:pk>/file/", ChatAttachmentFileView.as_view(), name="chat-attachment-file"),
]
