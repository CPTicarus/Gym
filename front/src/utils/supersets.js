/**
 * Supersets arrive from the API flat. Every move of a training day is in
 * day.exercises, in order — a superset's moves included, each pointing at
 * its superset through `superset` — while day.supersets holds what belongs
 * to the round itself (sets, rest). This file puts the two back together,
 * so the builder, the member's plan and the gym session all group a day
 * the same way.
 */

/**
 * A training day as the blocks it's done in: single moves, and supersets
 * with their moves gathered inside, in order. A superset sits where its
 * first move does, and a move added to it later still lands inside it,
 * wherever its own `order` falls in the day.
 *
 * Takes { exercises, supersets } rather than a day, so sections without
 * supersets (warm-up, cool-down) run through it unchanged.
 */
export function dayBlocks({ exercises = [], supersets = [] }) {
  const groups = new Map(supersets.map((superset) => [superset.id, { ...superset, exercises: [] }]));
  const blocks = [];
  for (const exercise of exercises) {
    const group = exercise.superset != null ? groups.get(exercise.superset) : undefined;
    if (!group) {
      blocks.push({ type: "exercise", key: `exercise-${exercise.id}`, exercise });
      continue;
    }
    if (group.exercises.length === 0) {
      blocks.push({ type: "superset", key: `superset-${group.id}`, superset: group });
    }
    group.exercises.push(exercise);
  }
  return blocks;
}

/** The round, as written under a superset's label — same number style as
 * formatExerciseDetail, which describes the moves right below it. */
export function formatSupersetDetail(superset) {
  const parts = [`${superset.sets} ست`, "حرکات پشت سر هم"];
  if (superset.rest_seconds) parts.push(`${superset.rest_seconds} ثانیه استراحت بعد از هر دور`);
  return parts.join(" • ");
}
