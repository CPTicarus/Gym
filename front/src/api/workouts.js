import axiosClient from "./axiosClient.js";

// ---- Plans ----
export async function listWorkoutPlans(params = {}) {
  const { data } = await axiosClient.get("/workout-plans/", { params });
  return data;
}

export async function getWorkoutPlan(planId) {
  const { data } = await axiosClient.get(`/workout-plans/${planId}/`);
  return data; // includes warmup_exercises, days[].exercises + days[].supersets, daily_exercises
}

export async function createWorkoutPlan(payload) {
  const { data } = await axiosClient.post("/workout-plans/", payload);
  return data;
}

export async function updateWorkoutPlan(planId, payload) {
  const { data } = await axiosClient.patch(`/workout-plans/${planId}/`, payload);
  return data;
}

export async function deleteWorkoutPlan(planId) {
  await axiosClient.delete(`/workout-plans/${planId}/`);
}

export async function assignWorkoutPlan(planId, userId) {
  const { data } = await axiosClient.post(`/workout-plans/${planId}/assign/`, { user: userId });
  return data;
}

// ---- Section 1: warmup ----
export async function addWarmupExercise(planId, payload) {
  const { data } = await axiosClient.post(`/workout-plans/${planId}/warmup/`, payload);
  return data;
}

export async function updateWarmupExercise(planId, exerciseId, payload) {
  const { data } = await axiosClient.patch(`/workout-plans/${planId}/warmup/${exerciseId}/`, payload);
  return data;
}

export async function deleteWarmupExercise(planId, exerciseId) {
  await axiosClient.delete(`/workout-plans/${planId}/warmup/${exerciseId}/`);
}

// ---- Section 2: days, and exercises within a day ----
export async function addWorkoutDay(planId, payload) {
  const { data } = await axiosClient.post(`/workout-plans/${planId}/days/`, payload);
  return data;
}

export async function deleteWorkoutDay(planId, dayId) {
  await axiosClient.delete(`/workout-plans/${planId}/days/${dayId}/`);
}

export async function addDayExercise(planId, dayId, payload) {
  const { data } = await axiosClient.post(`/workout-plans/${planId}/days/${dayId}/exercises/`, payload);
  return data;
}

export async function updateDayExercise(planId, dayId, exerciseId, payload) {
  const { data } = await axiosClient.patch(
    `/workout-plans/${planId}/days/${dayId}/exercises/${exerciseId}/`,
    payload
  );
  return data;
}

export async function deleteDayExercise(planId, dayId, exerciseId) {
  await axiosClient.delete(`/workout-plans/${planId}/days/${dayId}/exercises/${exerciseId}/`);
}

// ---- Supersets within a day ----
// Created together with their moves — { sets, rest_seconds, name, notes,
// exercises: [{ move, reps | duration_seconds }, ...] }, at least two. After
// that the round is edited here, and each move as a day exercise: add one
// with `superset: <id>` to join it, and deleting down to a single move turns
// that move back into an ordinary exercise.
export async function addSuperset(planId, dayId, payload) {
  const { data } = await axiosClient.post(`/workout-plans/${planId}/days/${dayId}/supersets/`, payload);
  return data;
}

export async function updateSuperset(planId, dayId, supersetId, payload) {
  const { data } = await axiosClient.patch(
    `/workout-plans/${planId}/days/${dayId}/supersets/${supersetId}/`,
    payload
  );
  return data;
}

/** Takes the superset's moves with it. */
export async function deleteSuperset(planId, dayId, supersetId) {
  await axiosClient.delete(`/workout-plans/${planId}/days/${dayId}/supersets/${supersetId}/`);
}

// ---- Section 3: daily items ----
export async function addDailyExercise(planId, payload) {
  const { data } = await axiosClient.post(`/workout-plans/${planId}/daily/`, payload);
  return data;
}

export async function updateDailyExercise(planId, exerciseId, payload) {
  const { data } = await axiosClient.patch(`/workout-plans/${planId}/daily/${exerciseId}/`, payload);
  return data;
}

export async function deleteDailyExercise(planId, exerciseId) {
  await axiosClient.delete(`/workout-plans/${planId}/daily/${exerciseId}/`);
}

// ---- Member-facing ----
export async function listMyWorkoutPlans(params = {}) {
  const { data } = await axiosClient.get("/my-workout-plans/", { params });
  return data;
}

// Ends today's gym session — advances which day comes up next time, and
// logs the session itself. `stats` is what the browser counted (duration,
// how many moves were ticked off, sets/reps); the server only ever sees
// the totals, since it has no idea which checkboxes were tapped.
export async function finishWorkoutDay(assignmentId, stats = {}) {
  const { data } = await axiosClient.post(`/my-workout-plans/${assignmentId}/finish-day/`, stats);
  return data;
}

// Finished sessions, newest first — the raw material for the month count
// and the week streak, which are worked out client-side (see
// utils/workoutStats.js for why the calendar maths lives there).
export async function listMyWorkoutSessions() {
  const { data } = await axiosClient.get("/my-workout-sessions/");
  return data;
}

// ---- Staff-facing assignments (who has which plan) ----
export async function listWorkoutAssignments(params = {}) {
  const { data } = await axiosClient.get("/workout-assignments/", { params });
  return data;
}

export async function updateWorkoutAssignment(assignmentId, payload) {
  const { data } = await axiosClient.patch(`/workout-assignments/${assignmentId}/`, payload);
  return data;
}

export async function deleteWorkoutAssignment(assignmentId) {
  await axiosClient.delete(`/workout-assignments/${assignmentId}/`);
}

/**
 * Deep-copy a plan — everything inside it, but none of its assignments.
 * The copy starts unassigned on purpose: it exists to be changed before
 * anyone is put on it. Returns the new plan, so the caller can navigate
 * straight into it.
 */
export async function duplicateWorkoutPlan(planId, name) {
  const { data } = await axiosClient.post(`/workout-plans/${planId}/duplicate/`, { name });
  return data;
}
