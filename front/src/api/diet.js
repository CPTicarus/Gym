import axiosClient from "./axiosClient.js";

// ---- Plans ----
export async function listDietPlans(params = {}) {
  const { data } = await axiosClient.get("/diet-plans/", { params });
  return data;
}

export async function getDietPlan(planId) {
  const { data } = await axiosClient.get(`/diet-plans/${planId}/`);
  return data; // includes meals[].items
}

export async function createDietPlan(payload) {
  const { data } = await axiosClient.post("/diet-plans/", payload);
  return data;
}

export async function updateDietPlan(planId, payload) {
  const { data } = await axiosClient.patch(`/diet-plans/${planId}/`, payload);
  return data;
}

export async function deleteDietPlan(planId) {
  await axiosClient.delete(`/diet-plans/${planId}/`);
}

export async function assignDietPlan(planId, userId) {
  const { data } = await axiosClient.post(`/diet-plans/${planId}/assign/`, { user: userId });
  return data;
}

// ---- Meals ----
export async function addMeal(planId, payload) {
  const { data } = await axiosClient.post(`/diet-plans/${planId}/meals/`, payload);
  return data;
}

export async function deleteMeal(planId, mealId) {
  await axiosClient.delete(`/diet-plans/${planId}/meals/${mealId}/`);
}

// ---- Food items within a meal ----
export async function addDietItem(planId, mealId, payload) {
  const { data } = await axiosClient.post(`/diet-plans/${planId}/meals/${mealId}/items/`, payload);
  return data;
}

export async function deleteDietItem(planId, mealId, itemId) {
  await axiosClient.delete(`/diet-plans/${planId}/meals/${mealId}/items/${itemId}/`);
}

// ---- Member-facing ----
export async function listMyDietPlans(params = {}) {
  const { data } = await axiosClient.get("/my-diet-plans/", { params });
  return data;
}

// ---- Staff-facing assignments (who has which plan) ----
export async function listDietAssignments(params = {}) {
  const { data } = await axiosClient.get("/diet-assignments/", { params });
  return data;
}

export async function updateDietAssignment(assignmentId, payload) {
  const { data } = await axiosClient.patch(`/diet-assignments/${assignmentId}/`, payload);
  return data;
}

export async function deleteDietAssignment(assignmentId) {
  await axiosClient.delete(`/diet-assignments/${assignmentId}/`);
}
