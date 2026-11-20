import axiosClient from "./axiosClient.js";

export async function fetchPublicConfig() {
  const { data } = await axiosClient.get("/config/");
  return data;
}

export async function updateBranding(changes) {
  const { data } = await axiosClient.patch("/config/branding/", changes);
  return data;
}
