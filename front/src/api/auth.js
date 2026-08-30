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
