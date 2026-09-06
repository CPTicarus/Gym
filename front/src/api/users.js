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
 * backend to a member's own details (MemberEditSerializer), so `role` and
 * `is_active` from an accounting user are ignored rather than applied.
 * Which records each may touch at all is enforced per object server-side.
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

/**
 * Give a user a new password. There is no counterpart that reads one:
 * passwords are stored as a one-way hash, so the existing value cannot be
 * fetched by staff, by an admin, or by anything else — only replaced.
 * Whoever calls this already knows the value they set, which is what the
 * front desk actually needs in order to tell someone their new password.
 */
export async function setUserPassword(userId, password) {
  await axiosClient.post(`/users/${userId}/set-password/`, { password });
}
