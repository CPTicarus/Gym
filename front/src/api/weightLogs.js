import axiosClient from "./axiosClient.js";

export async function listMyWeightLogs() {
  const { data } = await axiosClient.get("/me/weight-logs/");
  return data.results ?? data;
}

/** Upserts by day server-side — logging again for today updates that entry. */
export async function logWeight(payload) {
  const { data } = await axiosClient.post("/me/weight-logs/", payload);
  return data;
}

export async function deleteWeightLog(logId) {
  await axiosClient.delete(`/me/weight-logs/${logId}/`);
}
