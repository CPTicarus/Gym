import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { listChatMessages, sendChatMessage } from "../../api/chat.js";
import { PaperclipIcon, XIcon } from "../../components/common/icons.jsx";
import UnreadChatIndicator from "../../components/common/UnreadChatIndicator.jsx";
import { useAppConfig } from "../../hooks/useAppConfig.js";
import { useVisiblePolling } from "../../hooks/useVisiblePolling.js";
import { fullName } from "../../utils/format.js";
import { toPersianDigits } from "../../utils/jalali.js";
import ChatAttachmentPreview from "./ChatAttachmentPreview.jsx";
import { useMarkChatRead } from "./useMarkChatRead.js";

const BYTES_PER_MB = 1024 * 1024;
const MAX_ATTACHMENTS = 10;
const MAX_TOTAL_MB = 100;
const MAX_TEXT_LENGTH = 5_000;
const dateTime = new Intl.DateTimeFormat("fa-IR", { dateStyle: "short", timeStyle: "short" });

function mergeMessages(current, received) {
  if (!received.length) return current;
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of received) byId.set(message.id, message);
  return Array.from(byId.values()).sort((a, b) => a.id - b.id);
}

function isExpired(attachment, now) {
  return attachment.expired || (attachment.available_until && Date.parse(attachment.available_until) <= now);
}

function attachmentError(files, maxSizeMb) {
  if (files.length > MAX_ATTACHMENTS) return `هر پیام حداکثر ${toPersianDigits(MAX_ATTACHMENTS)} پیوست می‌پذیرد.`;
  if (files.some((file) => file.size === 0)) return "فایل خالی قابل ارسال نیست.";
  if (maxSizeMb && files.some((file) => file.size > maxSizeMb * BYTES_PER_MB)) {
    return `حجم هر فایل باید حداکثر ${toPersianDigits(maxSizeMb)} مگابایت باشد.`;
  }
  if (files.reduce((total, file) => total + file.size, 0) > MAX_TOTAL_MB * BYTES_PER_MB) {
    return `مجموع حجم پیوست‌های هر پیام باید حداکثر ${toPersianDigits(MAX_TOTAL_MB)} مگابایت باشد.`;
  }
  return null;
}

function sendErrorMessage(error) {
  if (error?.response?.status === 413) return "حجم پیوست‌ها بیش از حد مجاز است.";
  if (error?.response?.status === 404) return "این گفت‌وگو دیگر در دسترس نیست.";
  const data = error?.response?.data;
  const detail = data?.attachments ?? data?.text ?? data?.non_field_errors ?? data?.detail;
  const message = Array.isArray(detail) ? detail[0] : detail;
  return typeof message === "string" ? message : "ارسال پیام با مشکل مواجه شد. دوباره تلاش کنید.";
}

export default function ChatThread({ partner, userId, showBack, drawerOpen, onRead }) {
  const partnerId = partner.id;
  const { chatMediaMaxSizeMb, chatMediaRetentionDays } = useAppConfig();
  const [limits, setLimits] = useState(null);
  const maxSizeMb = limits?.maxSizeMb ?? chatMediaMaxSizeMb;
  const retentionDays = limits ? limits.retentionDays : chatMediaRetentionDays;
  const [now, setNow] = useState(Date.now);
  const [messages, setMessages] = useState([]);
  const [hasOlder, setHasOlder] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [olderError, setOlderError] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState(null);
  const [text, setText] = useState("");
  const [files, setFiles] = useState([]);
  const [preview, setPreview] = useState(null);
  const [isAtLatest, setIsAtLatest] = useState(true);
  const scroller = useRef(null);
  const fileInput = useRef(null);
  const throughId = useRef(null);
  const oldestId = useRef(null);
  const lastRetention = useRef(undefined);
  const keepAtLatest = useRef(true);
  const olderRequest = useRef(null);
  const previousScroll = useRef(null);

  useEffect(() => () => olderRequest.current?.abort(), []);

  useLayoutEffect(() => {
    const viewport = scroller.current;
    if (!viewport) return;
    if (previousScroll.current) {
      const { height, top } = previousScroll.current;
      viewport.scrollTop = top + viewport.scrollHeight - height;
      previousScroll.current = null;
    } else if (keepAtLatest.current) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [messages]);

  const load = useCallback(async (signal) => {
    setNow(Date.now());
    const isInitial = throughId.current === null;
    let after = throughId.current;
    try {
      let page = await listChatMessages(partnerId, isInitial ? undefined : { after }, signal);
      if (signal.aborted) return;

      const hasEarlierPage = page.has_older;
      if (!isInitial && page.retention_days !== lastRetention.current && oldestId.current !== null) {
        // Refresh attachment status for the history already on screen when the policy changes.
        after = oldestId.current - 1;
        page = await listChatMessages(partnerId, { after }, signal);
      }

      const received = [];
      while (!signal.aborted) {
        const batch = page.results;
        received.push(...batch);
        if (batch.length) {
          after = batch[batch.length - 1].id;
        }
        if (!page.has_newer || !batch.length) break;
        page = await listChatMessages(partnerId, { after }, signal);
      }

      if (signal.aborted) return;
      if (isInitial) setHasOlder(hasEarlierPage);
      if (received.length) {
        oldestId.current = Math.min(oldestId.current ?? Infinity, received[0].id);
        setMessages((current) => mergeMessages(current, received));
      }
      throughId.current = Math.max(throughId.current ?? 0, after ?? 0);
      lastRetention.current = page.retention_days;
      setLimits({ maxSizeMb: page.max_size_mb, retentionDays: page.retention_days });
      setLoadError(false);
    } catch {
      if (!signal.aborted) setLoadError(true);
    } finally {
      if (!signal.aborted) setIsLoading(false);
    }
  }, [partnerId]);
  const refresh = useVisiblePolling(load);

  async function loadOlder() {
    if (olderRequest.current || !messages.length) return;
    const controller = new AbortController();
    olderRequest.current = controller;
    setIsLoadingOlder(true);
    setOlderError(false);
    try {
      const page = await listChatMessages(partnerId, { before: messages[0].id }, controller.signal);
      if (controller.signal.aborted) return;
      const viewport = scroller.current;
      if (viewport && page.results.length) {
        previousScroll.current = { height: viewport.scrollHeight, top: viewport.scrollTop };
        oldestId.current = Math.min(oldestId.current ?? Infinity, page.results[0].id);
        setMessages((current) => mergeMessages(current, page.results));
      }
      setHasOlder(page.has_older);
    } catch {
      if (!controller.signal.aborted) setOlderError(true);
    } finally {
      olderRequest.current = null;
      if (!controller.signal.aborted) setIsLoadingOlder(false);
    }
  }

  function checkScroll() {
    const viewport = scroller.current;
    keepAtLatest.current = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 40;
    setIsAtLatest(keepAtLatest.current);
  }

  function scrollToLatest() {
    keepAtLatest.current = true;
    setIsAtLatest(true);
    const viewport = scroller.current;
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }

  function addFiles(event) {
    const nextFiles = [...files, ...event.target.files];
    event.target.value = "";
    const error = attachmentError(nextFiles, maxSizeMb);
    setSendError(error);
    if (!error) setFiles(nextFiles);
  }

  async function send(event) {
    event.preventDefault();
    const messageText = text.trim();
    if (isSending || (!messageText && !files.length)) return;
    const error = attachmentError(files, maxSizeMb);
    setSendError(error);
    if (error) return;
    setIsSending(true);
    try {
      const message = await sendChatMessage(partnerId, messageText, files);
      setText("");
      setFiles([]);
      scrollToLatest();
      setMessages((current) => mergeMessages(current, [message]));
      refresh();
    } catch (error) {
      setSendError(sendErrorMessage(error));
    } finally {
      setIsSending(false);
    }
  }

  const closePreview = useCallback(() => setPreview(null), []);
  const previewMessage = preview && messages.find((message) => message.id === preview.messageId);
  const previewAttachment = previewMessage?.attachments.find((attachment) => attachment.id === preview.attachmentId);
  const canPreview = previewAttachment && !isExpired(previewAttachment, now);
  const newestIncomingId = messages.reduce(
    (latest, message) => message.sender_id === partnerId ? message.id : latest,
    null,
  );
  const readTarget = useMarkChatRead(partnerId, newestIncomingId, !drawerOpen && !canPreview, onRead);

  useEffect(() => {
    if (preview && !canPreview) closePreview();
  }, [preview, canPreview, closePreview]);

  return (
    <section className="card flex min-w-0 flex-col p-0" aria-label={`گفت‌وگو با ${fullName(partner)}`}>
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="min-w-0 truncate text-base" dir="auto">{fullName(partner)}</h2>
          {partner.unread && <UnreadChatIndicator />}
        </div>
        {showBack && <Link className="btn btn-ghost btn-sm shrink-0 lg:hidden" to="/chat">فهرست گفت‌وگوها</Link>}
      </header>

      {loadError && (
        <div className="error-text mx-4 flex flex-wrap items-center justify-between gap-2" role="alert">
          <span>دریافت پیام‌ها با مشکل مواجه شد.</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={refresh}>تلاش دوباره</button>
        </div>
      )}

      <div
        className="h-[50dvh] min-h-48 overflow-y-auto bg-canvas/70 p-4 [overflow-anchor:none] sm:h-[55dvh]"
        ref={scroller}
        onScroll={checkScroll}
        role="log"
        aria-label="پیام‌ها"
        tabIndex={0}
      >
        {hasOlder && (
          <div className="mb-4 text-center">
            <button type="button" className="btn btn-ghost btn-sm" onClick={loadOlder} disabled={isLoadingOlder}>
              {isLoadingOlder ? "در حال دریافت…" : "پیام‌های قبلی"}
            </button>
            {olderError && <p className="error-text" role="alert">دریافت پیام‌های قبلی با مشکل مواجه شد.</p>}
          </div>
        )}
        {isLoading && <p className="muted text-center text-sm">در حال دریافت پیام‌ها…</p>}
        {!isLoading && !loadError && messages.length === 0 && (
          <p className="muted text-center text-sm">هنوز پیامی در این گفت‌وگو نیست.</p>
        )}
        <ol className="flex flex-col gap-3">
          {messages.map((message) => {
            const own = message.sender_id === userId;
            return (
              <li
                key={message.id}
                ref={message.id === newestIncomingId ? readTarget : null}
                className={`max-w-[88%] rounded-xl border border-line px-3 py-2 text-sm sm:max-w-[75%] ${own ? "self-start bg-accent-soft" : "self-end bg-surface"}`}
              >
                <span className="sr-only">{own ? "شما" : fullName(partner)}</span>
                {message.text && <p className="whitespace-pre-wrap [overflow-wrap:anywhere]" dir="auto">{message.text}</p>}
                {message.attachments.length > 0 && (
                  <ul className="space-y-1.5 py-1">
                    {message.attachments.map((attachment) => {
                      const expired = isExpired(attachment, now);
                      return (
                        <li key={attachment.id}>
                          {expired ? (
                            <span className="flex min-w-0 items-center gap-2 text-xs text-muted">
                              <PaperclipIcon size={14} />
                              <bdi className="truncate">{attachment.name}</bdi>
                              <span className="shrink-0">· حذف شده</span>
                            </span>
                          ) : (
                            <button
                              className="btn btn-ghost btn-sm w-full justify-start bg-surface"
                              type="button"
                              onClick={() => setPreview({ messageId: message.id, attachmentId: attachment.id })}
                            >
                              <PaperclipIcon size={14} className="shrink-0" />
                              <bdi className="truncate">{attachment.name}</bdi>
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                <time className="mt-1 block text-end text-xs text-muted" dateTime={message.created_at}>
                  {dateTime.format(new Date(message.created_at))}
                </time>
              </li>
            );
          })}
        </ol>
      </div>

      <form className="space-y-2 border-t border-line p-3 sm:p-4" onSubmit={send}>
        {!isAtLatest && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={scrollToLatest}>جدیدترین پیام‌ها</button>
        )}
        {files.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="پیوست‌های انتخاب‌شده">
            {files.map((file, index) => (
              <li key={`${file.name}-${file.lastModified}-${index}`} className="flex max-w-full items-center gap-2 rounded-lg bg-neutral-soft ps-2 text-xs">
                <bdi className="truncate">{file.name}</bdi>
                <button
                  type="button"
                  className="icon-btn icon-btn-sm"
                  disabled={isSending}
                  onClick={() => {
                    setFiles(files.filter((_, fileIndex) => fileIndex !== index));
                    setSendError(null);
                  }}
                  aria-label={`برداشتن ${file.name}`}
                >
                  <XIcon size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <textarea
          className="textarea w-full text-sm"
          rows={2}
          dir="auto"
          aria-label="متن پیام"
          placeholder="متن پیام"
          maxLength={MAX_TEXT_LENGTH}
          disabled={isSending}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        {sendError && <p className="error-text" role="alert">{sendError}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => fileInput.current?.click()}
              disabled={isSending || files.length >= MAX_ATTACHMENTS}
            >
              <PaperclipIcon size={16} />
              پیوست عکس یا ویدیو
            </button>
            <input type="file" multiple ref={fileInput} className="hidden" onChange={addFiles} />
            {maxSizeMb && <span className="text-xs text-muted">تا {toPersianDigits(maxSizeMb)} مگابایت برای هر فایل</span>}
          </div>
          <button className="btn btn-primary btn-sm" type="submit" disabled={isSending || (!text.trim() && !files.length)}>
            {isSending ? "در حال ارسال…" : "ارسال پیام"}
          </button>
        </div>
        {retentionDays !== undefined && (
          <p className="text-xs text-muted">
            {retentionDays === null
              ? "پیوست‌ها به‌صورت خودکار حذف نمی‌شوند."
              : `پیوست‌ها پس از ${toPersianDigits(retentionDays)} روز حذف می‌شوند.`}
          </p>
        )}
      </form>

      {canPreview && (
        <ChatAttachmentPreview key={previewAttachment.id} attachment={previewAttachment} onClose={closePreview} />
      )}
    </section>
  );
}
