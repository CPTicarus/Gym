import axiosClient from "./axiosClient.js";

/** How this gym is set up, readable before anyone signs in:
 *  { member_signup: "staff" | "self" }. See PublicConfigView. */
export async function fetchPublicConfig() {
  const { data } = await axiosClient.get("/config/");
  return data;
}
