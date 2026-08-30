import axiosClient from "./axiosClient.js";

export async function listAccountingMembers(params = {}) {
  const { data } = await axiosClient.get("/accounting/members/", { params });
  return data; // DRF paginated: { count, next, previous, results }
}
