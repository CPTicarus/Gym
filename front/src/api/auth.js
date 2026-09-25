import axiosClient from "./axiosClient.js";

export async function loginRequest(username, password) {
  const { data } = await axiosClient.post("/auth/login/", { username, password });
  return data; // { access, refresh }
}

export async function fetchMe() {
  const { data } = await axiosClient.get("/auth/me/");
  return data;
}

export async function updateMe(payload) {
  const { data } = await axiosClient.patch("/auth/me/", payload);
  return data;
}

/** Change the signed-in user's own password. Needs the current one; the
 *  new one is held to the rules for the user's role (a member may use a
 *  short PIN, staff may not). Rate-limited per account — a 429 means wait. */
export async function changeMyPassword(currentPassword, password) {
  await axiosClient.post("/auth/change-password/", { current_password: currentPassword, password });
}
