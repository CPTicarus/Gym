import axiosClient from "./axiosClient.js";

export async function listUsers(params = {}) {
  const { data } = await axiosClient.get("/users/", { params });
  return data; // DRF paginated: { count, next, previous, results }
}
