import axiosClient from "./axiosClient.js";

// ---- Plans ----
export async function listWorkoutPlans(params = {}) {
  const { data } = await axiosClient.get("/workout-plans/", { params });
  return data;
}

export async function getWorkoutPlan(planId) {
  const { data } = await axiosClient.get(`/workout-plans/${planId}/`);
  return data; // includes warmup_exercises, days[].exercises, daily_exercises
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

export async function deleteDayExercise(planId, dayId, exerciseId) {
  await axiosClient.delete(`/workout-plans/${planId}/days/${dayId}/exercises/${exerciseId}/`);
}

// ---- Section 3: daily items ----
export async function addDailyExercise(planId, payload) {
  const { data } = await axiosClient.post(`/workout-plans/${planId}/daily/`, payload);
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
