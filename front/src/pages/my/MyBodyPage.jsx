import { useCallback, useEffect, useState } from "react";

import {
  addHealthCondition,
  deleteHealthCondition,
  deleteMeasurement,
  listMyHealthConditions,
  listMyMeasurements,
  logMeasurement,
} from "../../api/body.js";
import MeasurementTrend from "../../components/body/MeasurementTrend.jsx";
import JalaliDateInput from "../../components/common/JalaliDateInput.jsx";
import { TrashIcon } from "../../components/common/icons.jsx";
import {
  conditionLabel,
  HEALTH_CONDITIONS,
  OTHER_CONDITION,
} from "../../constants/healthConditions.js";
import { useAuth } from "../../hooks/useAuth.js";
import { getBmiCategory, getWhrCategory, getWhtrCategory } from "../../utils/bmi.js";
import { formatDate } from "../../utils/format.js";
import { toPersianDigits } from "../../utils/jalali.js";

function formatApiError(data) {
  if (typeof data === "string") return data;
  const first = Object.values(data)[0];
  return Array.isArray(first) ? first[0] : String(first);
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/** One derived number with its category badge. */
function Stat({ label, value, unit, category }) {
  return (
    <div className="detail-item">
      <dt className="label">{label}</dt>
      <dd className="detail-value">
        {value == null ? (
          "—"
        ) : (
          <>
            {toPersianDigits(value)}
            {unit && <span className="muted text-xs"> {unit}</span>}
            {category && <span className={`badge badge-${category.variant} mr-2`}>{category.label}</span>}
          </>
        )}
      </dd>
    </div>
  );
}

export default function MyBodyPage() {
  const { user, updateProfile, refreshProfile } = useAuth();

  const [entries, setEntries] = useState([]);
  const [conditions, setConditions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const [heightCm, setHeightCm] = useState("");
  const [isSavingHeight, setIsSavingHeight] = useState(false);

  const [recordedAt, setRecordedAt] = useState(todayIso());
  const [weight, setWeight] = useState("");
  const [waist, setWaist] = useState("");
  const [hips, setHips] = useState("");
  const [chest, setChest] = useState("");
  const [arm, setArm] = useState("");
  const [thigh, setThigh] = useState("");
  const [isLogging, setIsLogging] = useState(false);
  const [logError, setLogError] = useState(null);

  const [newCondition, setNewCondition] = useState("");
  const [otherDescription, setOtherDescription] = useState("");
  const [conditionNotes, setConditionNotes] = useState("");
  const [isAddingCondition, setIsAddingCondition] = useState(false);
  const [conditionError, setConditionError] = useState(null);

  const load = useCallback(async () => {
    try {
      const [measurements, health] = await Promise.all([
        listMyMeasurements(),
        listMyHealthConditions(),
      ]);
      setEntries(measurements);
      setConditions(health);
    } catch {
      setError("بارگذاری اطلاعات با مشکل مواجه شد.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setHeightCm(user?.height_cm != null ? String(user.height_cm) : "");
  }, [user?.height_cm]);

  async function handleSaveHeight(e) {
    e.preventDefault();
    setIsSavingHeight(true);
    try {
      await updateProfile({ height_cm: heightCm === "" ? null : Number(heightCm) });
    } catch {
      setError("ذخیره قد با مشکل مواجه شد.");
    } finally {
      setIsSavingHeight(false);
    }
  }

  async function handleLog(e) {
    e.preventDefault();
    setLogError(null);
    if (!weight && !waist && !hips && !chest && !arm && !thigh) {
      setLogError("حداقل یکی از اندازه‌ها را وارد کنید.");
      return;
    }
    setIsLogging(true);
    try {
      // Only send what was actually measured. The server merges into the
      // day's entry, so omitting a field leaves any earlier value for that
      // day alone instead of erasing it.
      const payload = { recorded_at: recordedAt };
      if (weight) payload.weight_kg = Number(weight);
      if (waist) payload.waist_cm = Number(waist);
      if (hips) payload.hips_cm = Number(hips);
      if (chest) payload.chest_cm = Number(chest);
      if (arm) payload.arm_cm = Number(arm);
      if (thigh) payload.thigh_cm = Number(thigh);
      await logMeasurement(payload);
      setWeight("");
      setWaist("");
      setHips("");
      setChest("");
      setArm("");
      setThigh("");
      await load();
      // BMI and WHR are derived on the user object, so the profile has to
      // be re-pulled for the stats above to move.
      await refreshProfile();
    } catch (err) {
      setLogError(err?.response?.data ? formatApiError(err.response.data) : "ثبت اندازه‌ها با مشکل مواجه شد.");
    } finally {
      setIsLogging(false);
    }
  }

  async function handleDeleteEntry(entry) {
    if (!window.confirm(`ثبت ${formatDate(entry.recorded_at)} حذف شود؟`)) return;
    await deleteMeasurement(entry.id);
    await load();
    await refreshProfile();
  }

  async function handleAddCondition(e) {
    e.preventDefault();
    setConditionError(null);
    if (!newCondition) {
      setConditionError("یک مورد را انتخاب کنید.");
      return;
    }
    setIsAddingCondition(true);
    try {
      const created = await addHealthCondition({
        condition: newCondition,
        description: newCondition === OTHER_CONDITION ? otherDescription.trim() : "",
        notes: conditionNotes.trim(),
      });
      setConditions((prev) => [...prev, created]);
      setNewCondition("");
      setOtherDescription("");
      setConditionNotes("");
    } catch (err) {
      setConditionError(
        err?.response?.data ? formatApiError(err.response.data) : "ثبت مورد با مشکل مواجه شد."
      );
    } finally {
      setIsAddingCondition(false);
    }
  }

  async function handleDeleteCondition(condition) {
    await deleteHealthCondition(condition.id);
    setConditions((prev) => prev.filter((c) => c.id !== condition.id));
  }

  const flagged = new Set(conditions.map((c) => c.condition));

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">بدن من</h1>
          <p className="page-subtitle">
            اندازه‌های خودتان را ثبت کنید تا روند پیشرفتتان را ببینید. این اطلاعات را فقط شما و مربی شما خواهند دید.
          </p>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      {/* Current state, derived from the newest entry that has each value */}
      <section className="card plan-section">
        <h2 className="plan-section-title">وضعیت فعلی</h2>
        <dl className="detail-grid">
          <Stat label="قد" value={user?.height_cm} unit="سانتی‌متر" />
          <Stat label="وزن" value={user?.latest_weight_kg} unit="کیلوگرم" />
          <Stat label="BMI" value={user?.bmi} category={getBmiCategory(user?.bmi)} />
          <Stat label="دور کمر" value={user?.latest_waist_cm} unit="سانتی‌متر" />
          <Stat label="دور باسن" value={user?.latest_hips_cm} unit="سانتی‌متر" />
          <Stat label="دور سینه" value={user?.latest_chest_cm} unit="سانتی‌متر" />
          <Stat label="دور بازو" value={user?.latest_arm_cm} unit="سانتی‌متر" />
          <Stat label="دور ران" value={user?.latest_thigh_cm} unit="سانتی‌متر" />
          <Stat
            label="نسبت کمر به باسن (WHR)"
            value={user?.whr}
            category={getWhrCategory(user?.whr, user?.gender)}
          />
          <Stat
            label="نسبت کمر به قد (WHtR)"
            value={user?.whtr}
            category={getWhtrCategory(user?.whtr)}
          />
        </dl>
        {user?.whr != null && !user?.gender && (
          <p className="muted plan-section-hint">
            برای تفسیر WHR به جنسیت نیاز است — حدود سالم آن برای مرد و زن متفاوت است. جنسیت را از مربی
            یا پذیرش بخواهید ثبت کند. WHtR و BMI به جنسیت وابسته نیستند و همین حالا تفسیر شده‌اند.
          </p>
        )}

        <h3 className="section-heading">قد</h3>
        <form className="add-day-form" onSubmit={handleSaveHeight}>
          <input
            className="input"
            dir="ltr"
            type="number"
            step="0.1"
            min="0"
            placeholder="قد به سانتی‌متر"
            aria-label="قد به سانتی‌متر"
            value={heightCm}
            onChange={(e) => setHeightCm(e.target.value)}
          />
          <button className="btn btn-secondary btn-sm" type="submit" disabled={isSavingHeight}>
            {isSavingHeight ? "…" : "ذخیره قد"}
          </button>
        </form>
      </section>

      {/* Log a new set of numbers */}
      <section className="card plan-section">
        <h2 className="plan-section-title">ثبت اندازه جدید</h2>
        <p className="muted plan-section-hint">
          فقط چیزی را که اندازه گرفته‌اید پر کنید؛ بقیه خالی بماند.
        </p>

        <form onSubmit={handleLog} noValidate>
          <label className="field">
            <span className="label">تاریخ</span>
            <JalaliDateInput value={recordedAt} onChange={setRecordedAt} />
          </label>

          <div className="exercise-add-numbers">
            <input
              className="input"
              dir="ltr"
              type="number"
              step="0.1"
              min="0"
              placeholder="وزن (kg)"
              aria-label="وزن به کیلوگرم"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
            <input
              className="input"
              dir="ltr"
              type="number"
              step="0.1"
              min="0"
              placeholder="دور کمر (cm)"
              aria-label="دور کمر به سانتی‌متر"
              value={waist}
              onChange={(e) => setWaist(e.target.value)}
            />
            <input
              className="input"
              dir="ltr"
              type="number"
              step="0.1"
              min="0"
              placeholder="دور باسن (cm)"
              aria-label="دور باسن به سانتی‌متر"
              value={hips}
              onChange={(e) => setHips(e.target.value)}
            />
            <input
              className="input"
              dir="ltr"
              type="number"
              step="0.1"
              min="0"
              placeholder="دور سینه (cm)"
              aria-label="دور سینه به سانتی‌متر"
              value={chest}
              onChange={(e) => setChest(e.target.value)}
            />
            <input
              className="input"
              dir="ltr"
              type="number"
              step="0.1"
              min="0"
              placeholder="دور بازو (cm)"
              aria-label="دور بازو به سانتی‌متر"
              value={arm}
              onChange={(e) => setArm(e.target.value)}
            />
            <input
              className="input"
              dir="ltr"
              type="number"
              step="0.1"
              min="0"
              placeholder="دور ران (cm)"
              aria-label="دور ران به سانتی‌متر"
              value={thigh}
              onChange={(e) => setThigh(e.target.value)}
            />
          </div>

          {logError && (
            <p className="error-text" role="alert">
              {logError}
            </p>
          )}

          <div className="form-actions">
            <button className="btn btn-primary" type="submit" disabled={isLogging}>
              {isLogging ? "در حال ثبت…" : "ثبت"}
            </button>
          </div>
        </form>
      </section>

      {/* Progress */}
      <section className="card plan-section">
        <h2 className="plan-section-title">روند تغییرات</h2>
        {isLoading ? (
          <p className="muted">در حال بارگذاری…</p>
        ) : entries.length === 0 ? (
          <p className="muted exercise-empty">هنوز اندازه‌ای ثبت نشده.</p>
        ) : (
          <>
            <div className="flex flex-col gap-4">
              <MeasurementTrend entries={entries} field="weight_kg" unit="kg" label="وزن" />
              <MeasurementTrend entries={entries} field="waist_cm" unit="cm" label="دور کمر" />
              <MeasurementTrend entries={entries} field="hips_cm" unit="cm" label="دور باسن" />
              <MeasurementTrend entries={entries} field="chest_cm" unit="cm" label="دور سینه" />
              <MeasurementTrend entries={entries} field="arm_cm" unit="cm" label="دور بازو" />
              <MeasurementTrend entries={entries} field="thigh_cm" unit="cm" label="دور ران" />
            </div>

            <h3 className="section-heading">ثبت‌های اخیر</h3>
            <ul className="exercise-list">
              {entries.map((entry) => (
                <li key={entry.id} className="exercise-row">
                  <div className="exercise-row-main">
                    <span className="exercise-name">{formatDate(entry.recorded_at)}</span>
                    <span className="muted exercise-detail">
                      {[
                        entry.weight_kg != null && `${toPersianDigits(entry.weight_kg)} kg`,
                        entry.waist_cm != null && `کمر ${toPersianDigits(entry.waist_cm)}`,
                        entry.hips_cm != null && `باسن ${toPersianDigits(entry.hips_cm)}`,
                        entry.chest_cm != null && `سینه ${toPersianDigits(entry.chest_cm)}`,
                        entry.arm_cm != null && `بازو ${toPersianDigits(entry.arm_cm)}`,
                        entry.thigh_cm != null && `ران ${toPersianDigits(entry.thigh_cm)}`,
                        // entry.whr != null && `WHR ${toPersianDigits(entry.whr)}`,
                        // entry.whtr != null && `WHtR ${toPersianDigits(entry.whtr)}`,
                      ]
                        .filter(Boolean)
                        .join(" • ")}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="icon-btn icon-btn-sm icon-btn-danger flex-none"
                    onClick={() => handleDeleteEntry(entry)}
                    aria-label={`حذف ثبت ${formatDate(entry.recorded_at)}`}
                  >
                    <TrashIcon size={16} />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* Health flags */}
      <section className="card plan-section">
        <h2 className="plan-section-title">مشکلات پزشکی</h2>
        <p className="muted plan-section-hint">
          هر مشکلی که ممکن است روی تمرین اثر بگذارد را اینجا ثبت کنید. مربی این فهرست را در صفحه شما
          می‌بیند.
        </p>

        {conditions.length === 0 ? (
          <p className="muted exercise-empty">موردی ثبت نشده.</p>
        ) : (
          <ul className="exercise-list">
            {conditions.map((condition) => (
              <li key={condition.id} className="exercise-row">
                <div className="exercise-row-main">
                  <span className="exercise-name">{conditionLabel(condition)}</span>
                  {condition.notes && <span className="muted exercise-detail">{condition.notes}</span>}
                </div>
                <button
                  type="button"
                  className="icon-btn icon-btn-sm icon-btn-danger flex-none"
                  onClick={() => handleDeleteCondition(condition)}
                  aria-label={`حذف ${conditionLabel(condition)}`}
                >
                  <TrashIcon size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <form className="exercise-add-form" onSubmit={handleAddCondition} noValidate>
          <select
            className="select"
            value={newCondition}
            onChange={(e) => setNewCondition(e.target.value)}
            aria-label="مورد سلامتی"
          >
            <option value="">— انتخاب کنید —</option>
            {HEALTH_CONDITIONS.map(([value, label]) => (
              <option key={value} value={value} disabled={flagged.has(value)}>
                {label}
                {flagged.has(value) ? " (ثبت شده)" : ""}
              </option>
            ))}
            <option value={OTHER_CONDITION}>سایر — خودم می‌نویسم</option>
          </select>

          {newCondition === OTHER_CONDITION && (
            <input
              className="input"
              dir="auto"
              placeholder="مشکل را بنویسید"
              aria-label="شرح مشکل"
              value={otherDescription}
              onChange={(e) => setOtherDescription(e.target.value)}
            />
          )}

          <input
            className="input"
            dir="auto"
            placeholder="توضیح (اختیاری) — مثلاً زانوی چپ، از پارسال"
            aria-label="توضیح"
            value={conditionNotes}
            onChange={(e) => setConditionNotes(e.target.value)}
          />

          {conditionError && (
            <p className="error-text" role="alert">
              {conditionError}
            </p>
          )}

          <div className="form-actions">
            <button className="btn btn-secondary btn-sm" type="submit" disabled={isAddingCondition}>
              {isAddingCondition ? "در حال ثبت…" : "+ افزودن"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
