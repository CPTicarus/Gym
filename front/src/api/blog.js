import axiosClient from "./axiosClient.js";

/**
 * A post's cover image is optional, so a write goes out as multipart only
 * when there's actually a file to upload — otherwise it's plain JSON, like
 * every other write in the app. Empty strings are still sent (that's how a
 * summary or category gets cleared); undefined/null fields are left out.
 */
function toBody({ coverImage, ...fields }) {
  if (!coverImage) return fields;

  const form = new FormData();
  Object.entries(fields).forEach(([key, value]) => {
    if (value !== undefined && value !== null) form.append(key, value);
  });
  form.append("cover_image", coverImage);
  return form;
}

function configFor(body) {
  return body instanceof FormData
    ? { headers: { "Content-Type": "multipart/form-data" } }
    : undefined;
}

export async function listPosts(params = {}) {
  const { data } = await axiosClient.get("/blog-posts/", { params });
  return data; // DRF paginated: { count, next, previous, results }
}

export async function getPost(postId) {
  const { data } = await axiosClient.get(`/blog-posts/${postId}/`);
  return data;
}

export async function createPost(payload) {
  const body = toBody(payload);
  const { data } = await axiosClient.post("/blog-posts/", body, configFor(body));
  return data;
}

export async function updatePost(postId, payload) {
  const body = toBody(payload);
  const { data } = await axiosClient.patch(`/blog-posts/${postId}/`, body, configFor(body));
  return data;
}

export async function deletePost(postId) {
  await axiosClient.delete(`/blog-posts/${postId}/`);
}
