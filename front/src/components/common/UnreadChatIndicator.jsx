import StatusLight from "./StatusLight.jsx";

export const UNREAD_CHAT_LABEL = "پیام خوانده‌نشده";

export default function UnreadChatIndicator({ className }) {
  return <StatusLight label={UNREAD_CHAT_LABEL} className={className} />;
}
