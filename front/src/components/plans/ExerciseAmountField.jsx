export default function ExerciseAmountField({ amount, amountType, onAmountChange, onTypeChange, label = "مقدار" }) {
  return (
    <div className="exercise-amount-input min-w-0">
      <div className="exercise-amount-field">
        <input
          className="input"
          type="text"
          dir="ltr"
          placeholder={amountType === "duration" ? "60-45" : "20-15-15"}
          aria-label={label}
          value={amount}
          onChange={(e) => onAmountChange(e.target.value)}
        />
        <select
          className="select"
          aria-label={`نوع ${label}`}
          value={amountType}
          onChange={(e) => onTypeChange(e.target.value)}
        >
          <option value="reps">تکرار</option>
          <option value="duration">ثانیه</option>
        </select>
      </div>
    </div>
  );
}
