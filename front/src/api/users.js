import axiosClient from "./axiosClient.js";

export async function listUsers(params = {}) {
  const { data } = await axiosClient.get("/users/", { params });
  return data; // DRF paginated: { count, next, previous, results }
}

export async function getUser(userId) {
  const { data } = await axiosClient.get(`/users/${userId}/`);
  return data;
}

/**
 * Admin sends the full profile; accounting's payload is narrowed by the
 * backend to membership dates only (MembershipUpdateSerializer), so
 * extra keys from an accounting user are simply ignored rather than
 * silently applied.
 */
export async function updateUser(userId, payload) {
  const { data } = await axiosClient.patch(`/users/${userId}/`, payload);
  return data;
}

/**
 * Front-desk account intake. `role` defaults to member server-side; an
 * admin can pass trainer/admin/accounting, and the API refuses a staff
 * role from anyone but an admin.
 */
export async function createUser(payload) {
  const { data } = await axiosClient.post("/users/", payload);
  return data;
}
