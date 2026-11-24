import { useContext } from "react";

import StatusLight from "../../components/common/StatusLight.jsx";
import { SystemResourcesContext } from "../../context/SystemResourcesContext.js";
import { formatResourceSize } from "./formatResourceSize.js";

const usedPercent = new Intl.NumberFormat("fa-IR", { style: "percent", maximumFractionDigits: 1 });

const STATUS = {
  healthy: { text: "با مصرف فعلی به ارتقا نیاز نیست.", style: "badge badge-success" },
  upgrade_recommended: { text: "افزایش ظرفیت سرور توصیه می‌شود.", style: "badge badge-danger" },
  unknown: { text: "اطلاعات کافی برای ارزیابی ارتقا در دسترس نیست.", style: "badge badge-neutral" },
};

function ResourceReading({ label, metric, availableBytes, availableLabel, warning }) {
  return (
    <div className="rounded-lg border border-line px-3 py-3">
      <dt className="text-sm font-bold">{label}</dt>
      {metric ? (
        <dd className="mt-2 space-y-2 text-sm">
          <p>{usedPercent.format(metric.used_percent / 100)} مصرف‌شده</p>
          <div className="h-2 overflow-hidden rounded-full bg-neutral-soft" aria-hidden="true">
            <div className={`h-full rounded-full ${warning ? "bg-danger" : "bg-accent"}`}
              style={{ width: `${metric.used_percent}%` }} />
          </div>
          <p className="text-xs text-muted">
            {formatResourceSize(availableBytes)} {availableLabel} از {formatResourceSize(metric.total_bytes)}
          </p>
        </dd>
      ) : (
        <dd className="mt-2 text-sm text-muted">اندازه‌گیری در دسترس نیست.</dd>
      )}
    </div>
  );
}

export default function ServerResourcesPanel() {
  const { resources, resourceError, refreshResources } = useContext(SystemResourcesContext);
  const assessment = resources ? STATUS[resources.status] ?? STATUS.unknown : null;

  return (
    <section className="card" aria-labelledby="server-resources-heading">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 id="server-resources-heading" className="text-lg">منابع سرور</h2>
        <button className="btn btn-ghost btn-sm" type="button" onClick={refreshResources}>
          به‌روزرسانی منابع
        </button>
      </div>
      {resourceError && (
        <p className="error-text" role="alert">
          {resources ? "به‌روزرسانی منابع سرور انجام نشد. آخرین اندازه‌گیری نمایش داده می‌شود."
            : "اندازه‌گیری منابع سرور انجام نشد. دوباره تلاش کنید."}
        </p>
      )}
      {!resources && !resourceError && <p className="text-sm text-muted" role="status">در حال اندازه‌گیری منابع…</p>}
      {resources && (
        <div className="space-y-3">
          <p className={assessment.style}>{assessment.text}</p>
          <dl className="grid gap-3 sm:grid-cols-2">
            <ResourceReading label="حافظهٔ RAM" metric={resources.memory} availableBytes={resources.memory?.available_bytes}
              availableLabel="در دسترس" warning={resources.memory_high} />
            <ResourceReading label="دیسک داده‌های سرور" metric={resources.disk} availableBytes={resources.disk?.free_bytes}
              availableLabel="خالی" warning={resources.storage_low} />
          </dl>
          {resources.memory_high && (
            <p className="text-sm text-danger">مصرف حافظهٔ RAM به ۸۵٪ یا بیشتر رسیده است.</p>
          )}
          {resources.storage_low && (
            <p className="flex items-center gap-2 text-sm text-danger">
              <StatusLight label="هشدار دیسک" tone="warning" />
              فضای خالی دیسک کمتر از ۵ گیگابایت است.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
