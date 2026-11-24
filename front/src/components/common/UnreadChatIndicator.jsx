export const UNREAD_CHAT_LABEL = "پیام خوانده‌نشده";

export default function UnreadChatIndicator({ className = "" }) {
  return (
    <span className={`inline-flex shrink-0 items-center ${className}`} title={UNREAD_CHAT_LABEL}>
      <span className="status-led text-success" aria-hidden="true" />
      <span className="sr-only">{UNREAD_CHAT_LABEL}</span>
    </span>
  );
}
