import axiosClient from "./axiosClient.js";

export async function listSupplementPlans(params = {}) {
  const { data } = await axiosClient.get("/supplement-plans/", { params });
  return data; // DRF paginated: { count, next, previous, results }
}

export async function getSupplementPlan(planId) {
  const { data } = await axiosClient.get(`/supplement-plans/${planId}/`);
  return data;
}

export async function createSupplementPlan(payload) {
  const { data } = await axiosClient.post("/supplement-plans/", payload);
  return data;
}

export async function updateSupplementPlan(planId, payload) {
  const { data } = await axiosClient.patch(`/supplement-plans/${planId}/`, payload);
  return data;
}

export async function deleteSupplementPlan(planId) {
  await axiosClient.delete(`/supplement-plans/${planId}/`);
}

export async function addSupplementItem(planId, payload) {
  const { data } = await axiosClient.post(`/supplement-plans/${planId}/items/`, payload);
  return data;
}

export async function updateSupplementItem(planId, itemId, payload) {
  const { data } = await axiosClient.patch(`/supplement-plans/${planId}/items/${itemId}/`, payload);
  return data;
}

export async function deleteSupplementItem(planId, itemId) {
  await axiosClient.delete(`/supplement-plans/${planId}/items/${itemId}/`);
}

/** Give a protocol to a member. The response's `previous_plan_archived`
 *  names whatever they were on before, since assigning replaces it. */
export async function assignSupplementPlan(planId, userId) {
  const { data } = await axiosClient.post(`/supplement-plans/${planId}/assign/`, { user: userId });
  return data;
}

export async function listSupplementAssignments(params = {}) {
  const { data } = await axiosClient.get("/supplement-assignments/", { params });
  return data;
}

export async function updateSupplementAssignment(assignmentId, payload) {
  const { data } = await axiosClient.patch(`/supplement-assignments/${assignmentId}/`, payload);
  return data;
}

export async function deleteSupplementAssignment(assignmentId) {
  await axiosClient.delete(`/supplement-assignments/${assignmentId}/`);
}

/** A member's own protocols. Usually empty — only a few members are on one. */
export async function listMySupplementPlans(params = {}) {
  const { data } = await axiosClient.get("/my-supplement-plans/", { params });
  return data;
}
