import axiosClient from "./axiosClient.js";

/** A member's own dated numbers — weight, waist, hips. Newest first. */
export async function listMyMeasurements() {
  const { data } = await axiosClient.get("/me/measurements/");
  return data.results ?? data;
}

/**
 * Record numbers for a day. The server upserts by date and MERGES, so
 * sending only a waist for a day that already has a weight keeps the
 * weight — send just the fields that were actually measured.
 */
export async function logMeasurement(payload) {
  const { data } = await axiosClient.post("/me/measurements/", payload);
  return data;
}

export async function deleteMeasurement(entryId) {
  await axiosClient.delete(`/me/measurements/${entryId}/`);
}

export async function listMyHealthConditions() {
  const { data } = await axiosClient.get("/me/health-conditions/");
  return data.results ?? data;
}

export async function addHealthCondition(payload) {
  const { data } = await axiosClient.post("/me/health-conditions/", payload);
  return data;
}

export async function deleteHealthCondition(conditionId) {
  await axiosClient.delete(`/me/health-conditions/${conditionId}/`);
}
