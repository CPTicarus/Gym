import { useCallback, useContext, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { listChatConversations } from "../../api/chat.js";
import { MessageIcon } from "../../components/common/icons.jsx";
import UnreadChatIndicator from "../../components/common/UnreadChatIndicator.jsx";
import { ChatUnreadContext } from "../../context/ChatUnreadContext.js";
import { useAuth } from "../../hooks/useAuth.js";
import { useVisiblePolling } from "../../hooks/useVisiblePolling.js";
import { fullName } from "../../utils/format.js";
import ChatThread from "./ChatThread.jsx";

export default function ChatPage() {
  const { partnerId } = useParams();
  const { role, user } = useAuth();
  const { refreshChatUnread, isDrawerOpen } = useContext(ChatUnreadContext);
  const [conversations, setConversations] = useState(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async (signal) => {
    try {
      const data = await listChatConversations(signal);
      if (signal.aborted) return;
      setConversations(data);
      setLoadError(false);
    } catch {
      if (!signal.aborted) setLoadError(true);
    }
  }, []);
  const refresh = useVisiblePolling(load);
  const handleRead = useCallback(() => {
    refresh();
    refreshChatUnread();
  }, [refresh, refreshChatUnread]);

  const isMember = role === "member";
  const selected = partnerId
    ? conversations?.find((conversation) => String(conversation.id) === partnerId)
    : isMember ? conversations?.[0] : undefined;

  return (
    <div className="mx-auto max-w-6xl">
      <header className="page-header">
        <h1 className="page-title">{isMember ? "گفت‌وگو با مربی" : "گفت‌وگوها"}</h1>
      </header>

      <div className={isMember ? "" : "grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start"}>
        {(!isMember || !selected) && (
          <section
            aria-label="فهرست گفت‌وگوها"
            className={`card min-w-0 p-3 lg:max-h-[70dvh] lg:overflow-y-auto ${selected ? "hidden lg:block" : ""}`}
          >
            {loadError && (
              <div className="error-text flex flex-wrap items-center justify-between gap-2" role="alert">
                <span>دریافت گفت‌وگوها با مشکل مواجه شد.</span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={refresh}>
                  تلاش دوباره
                </button>
              </div>
            )}
            {conversations === null && !loadError && <p className="muted p-3">در حال بارگذاری…</p>}
            {conversations?.length === 0 && (
              <p className="muted p-3">
                {isMember ? "هنوز مربی برای شما تعیین نشده است." : "هنوز عضوی به شما اختصاص داده نشده است."}
              </p>
            )}
            {conversations?.length > 0 && (
              <ul className="space-y-1">
                {conversations.map((conversation) => (
                  <li key={conversation.id}>
                    <Link
                      to={`/chat/${conversation.id}`}
                      aria-current={selected?.id === conversation.id ? "page" : undefined}
                      className="flex min-w-0 items-center gap-3 rounded-lg p-3 hover:bg-neutral-soft aria-[current=page]:bg-accent-soft"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-neutral-soft text-accent">
                        <MessageIcon size={18} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold" dir="auto">
                          {fullName(conversation)}
                        </span>
                        {conversation.last_message && (
                          <span className="block truncate text-xs text-muted" dir="auto">
                            {conversation.last_message.text || "عکس یا ویدیو"}
                          </span>
                        )}
                      </span>
                      {conversation.unread && <UnreadChatIndicator className="ms-auto" />}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {selected ? (
          <ChatThread
            key={selected.id}
            partner={selected}
            userId={user?.id}
            showBack={!isMember}
            drawerOpen={isDrawerOpen}
            onRead={handleRead}
          />
        ) : conversations?.length > 0 ? (
          <div className={`card min-h-48 items-center justify-center text-center text-muted ${partnerId ? "flex" : "hidden lg:flex"}`}>
            {partnerId ? "این گفت‌وگو در دسترس نیست." : "برای دیدن پیام‌ها، یک گفت‌وگو انتخاب کنید."}
          </div>
        ) : null}
      </div>
    </div>
  );
}
