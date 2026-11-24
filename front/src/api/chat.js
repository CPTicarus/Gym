import axiosClient from "./axiosClient.js";

function messagesPath(partnerId) {
  return `/chat/conversations/${partnerId}/messages/`;
}

export async function getChatUnread(signal) {
  const { data } = await axiosClient.get("/chat/unread/", { signal });
  return data.unread;
}

export async function listChatConversations(signal) {
  const { data } = await axiosClient.get("/chat/conversations/", { signal });
  return data;
}

export async function listChatMessages(partnerId, params, signal) {
  const { data } = await axiosClient.get(messagesPath(partnerId), { params, signal });
  return data;
}

export async function markChatRead(partnerId, throughId, signal) {
  await axiosClient.post(`/chat/conversations/${partnerId}/read/`, { through_id: throughId }, { signal });
}

export async function sendChatMessage(partnerId, text, attachments) {
  const form = new FormData();
  form.append("text", text);
  for (const file of attachments) form.append("attachments", file);
  const { data } = await axiosClient.post(messagesPath(partnerId), form);
  return data;
}

export async function getChatAttachment(attachmentId, signal) {
  const { data } = await axiosClient.get(`/chat/attachments/${attachmentId}/file/`, {
    responseType: "blob",
    signal,
  });
  return data;
}
