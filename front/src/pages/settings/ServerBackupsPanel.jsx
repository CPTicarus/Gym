import { useEffect, useRef, useState } from "react";

import { listLatestBackups, requestBackupDownload } from "../../api/systemAdmin.js";
import { formatResourceSize } from "./formatResourceSize.js";

const BACKUP_TYPES = [
  { kind: "database", title: "پشتیبان پایگاه داده", button: "دانلود پشتیبان پایگاه داده" },
  { kind: "full", title: "پشتیبان کامل سرور", button: "دانلود پشتیبان کامل سرور" },
];
const dateTime = new Intl.DateTimeFormat("fa-IR", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Tehran" });

export default function ServerBackupsPanel() {
  const [backups, setBackups] = useState(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [preparingKind, setPreparingKind] = useState(null);
  const [downloadMessage, setDownloadMessage] = useState(null);
  const downloadForm = useRef(null);
  const downloadRequest = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    listLatestBackups(signal)
      .then((data) => {
        if (!signal.aborted) setBackups(data);
      })
      .catch(() => {
        if (!signal.aborted) setLoadError(true);
      })
      .finally(() => {
        if (!signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [refreshVersion]);

  useEffect(() => () => downloadRequest.current?.abort(), []);

  function refreshBackups() {
    setLoading(true);
    setLoadError(false);
    setRefreshVersion((version) => version + 1);
  }

  async function downloadLatest(kind) {
    if (downloadRequest.current) return;
    const controller = new AbortController();
    const { signal } = controller;
    downloadRequest.current = controller;
    setPreparingKind(kind);
    setDownloadMessage(null);
    try {
      const { action, ticket } = await requestBackupDownload(kind, signal);
      const form = downloadForm.current;
      if (signal.aborted || !form) return;
      const field = form.elements.namedItem("ticket");
      form.action = action;
      field.value = ticket;
      try {
        // The browser saves the streamed attachment without buffering it in JavaScript.
        form.submit();
      } finally {
        field.value = "";
      }
      setDownloadMessage({ text: "درخواست دانلود ارسال شد." });
    } catch (error) {
      if (signal.aborted) return;
      const missing = error?.response?.status === 404;
      setDownloadMessage({
        error: true,
        text: missing ? "این پشتیبان دیگر در دسترس نیست." : "آماده‌سازی دانلود انجام نشد. دوباره تلاش کنید.",
      });
      if (missing) refreshBackups();
    } finally {
      downloadRequest.current = null;
      if (!signal.aborted) setPreparingKind(null);
    }
  }

  return (
    <section className="card" aria-labelledby="server-backups-heading">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 id="server-backups-heading" className="text-lg">آخرین نسخه‌های پشتیبان</h2>
        <button className="btn btn-ghost btn-sm" type="button" disabled={loading} onClick={refreshBackups}>
          به‌روزرسانی فهرست
        </button>
      </div>
      <p className="mb-3 text-sm text-muted">پشتیبان کامل شامل پایگاه داده و فایل‌های بارگذاری‌شده است.</p>
      {loading && <p className="text-sm text-muted" role="status">در حال دریافت فهرست…</p>}
      {loadError && <p className="error-text" role="alert">دریافت فهرست پشتیبان‌ها انجام نشد. دوباره تلاش کنید.</p>}
      {backups && (
        <ul className="space-y-3">
          {BACKUP_TYPES.map(({ kind, title, button }) => {
            const backup = backups[kind];
            return (
              <li key={kind} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line px-3 py-3">
                <div className="min-w-0 space-y-1">
                  <h3 className="text-sm">{title}</h3>
                  {backup ? (
                    <>
                      <p className="break-all text-xs"><bdi dir="ltr">{backup.name}</bdi></p>
                      <p className="text-xs text-muted">
                        <time dateTime={backup.created_at}>{dateTime.format(new Date(backup.created_at))}</time>
                        {" · "}{formatResourceSize(backup.size_bytes)}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-muted">نسخه‌ای برای دانلود موجود نیست.</p>
                  )}
                </div>
                {backup && (
                  <button className="btn btn-primary btn-sm" type="button" disabled={preparingKind !== null}
                    onClick={() => downloadLatest(kind)}>
                    {preparingKind === kind ? "در حال آماده‌سازی…" : button}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {downloadMessage && (
        <p className={downloadMessage.error ? "error-text" : "mt-3 text-sm text-success"}
          role={downloadMessage.error ? "alert" : "status"}>
          {downloadMessage.text}
        </p>
      )}
      <form ref={downloadForm} method="post" hidden>
        <input type="hidden" name="ticket" />
      </form>
    </section>
  );
}
