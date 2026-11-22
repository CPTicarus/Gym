import { formatExerciseAmount, getSetTargets } from "../../utils/exerciseAmount.js";
import { toPersianDigits } from "../../utils/jalali.js";
import { formatExerciseDetail } from "../../utils/planFormat.js";

export default function ExerciseDetail({ exercise }) {
  return (
    <span className="muted exercise-detail">
      {getSetTargets(exercise)?.length ? (
        <>
          <span className="sr-only">{exercise.seconds_per_set ? "مدت هر ست به‌ترتیب " : "تکرار هر ست به‌ترتیب "}</span>
          <bdi dir="ltr" className="[overflow-wrap:anywhere]">{formatExerciseAmount(exercise)}</bdi>
          {exercise.seconds_per_set && " ثانیه"}
          {exercise.rest_seconds ? ` · ${toPersianDigits(exercise.rest_seconds)} ثانیه استراحت` : ""}
        </>
      ) : formatExerciseDetail(exercise)}
    </span>
  );
}
