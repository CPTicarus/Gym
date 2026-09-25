import axiosClient from "./axiosClient.js";

/** A member's own dated numbers — weight, waist, hips. Newest first. */
export async function listMyMeasurements() {
  const { data } = await axiosClient.get("/me/measurements/");
  return data.results ?? data;
}

/**
 * Record numbers for a day. The server upserts by date and MERGES, so
 * sending only a waist for a day that already has a weight keeps the
 * weight — send just the fields that were actually measured.
 */
export async function logMeasurement(payload) {
  const { data } = await axiosClient.post("/me/measurements/", payload);
  return data;
}

export async function deleteMeasurement(entryId) {
  await axiosClient.delete(`/me/measurements/${entryId}/`);
}

export async function listMyHealthConditions() {
  const { data } = await axiosClient.get("/me/health-conditions/");
  return data.results ?? data;
}

export async function addHealthCondition(payload) {
  const { data } = await axiosClient.post("/me/health-conditions/", payload);
  return data;
}

export async function deleteHealthCondition(conditionId) {
  await axiosClient.delete(`/me/health-conditions/${conditionId}/`);
}

// ---- Body photos (front / side / back, and any extras) ----
//
// These are NOT ordinary media. They're stored outside the server's public
// media tree and streamed by a view that checks who's asking, which is why
// there's no plain URL to drop into an <img src>: the JWT lives in an
// Authorization header (see axiosClient), and a bare <img> would never
// send it. Callers fetch the bytes here and hand them to an object URL —
// see components/body/BodyPhotoImage.jsx.

export async function listMyBodyPhotos() {
  const { data } = await axiosClient.get("/me/body-photos/");
  return data.results ?? data;
}

/** Upload or replace one of the three main poses — the server keys on the
 *  pose, so posting "front" again swaps the existing photo rather than
 *  adding a second. With pose "extra" it always adds one. */
export async function uploadBodyPhoto(pose, file) {
  const form = new FormData();
  form.append("pose", pose);
  form.append("image", file);
  const { data } = await axiosClient.post("/me/body-photos/", form);
  return data;
}

/** Set (or, with "", clear) an extra photo's note for the trainer. Sent as
 *  a form like the uploads — the endpoint only reads multipart/form data. */
export async function updateBodyPhotoNote(photoId, note) {
  const form = new FormData();
  form.append("note", note);
  const { data } = await axiosClient.patch(`/me/body-photos/${photoId}/`, form);
  return data;
}

/** A new image for a photo that's already there — how an extra is
 *  replaced, since several share the "extra" pose and a POST would add
 *  another rather than swap this one. */
export async function replaceBodyPhoto(photoId, file) {
  const form = new FormData();
  form.append("image", file);
  const { data } = await axiosClient.patch(`/me/body-photos/${photoId}/`, form);
  return data;
}

export async function deleteBodyPhoto(photoId) {
  await axiosClient.delete(`/me/body-photos/${photoId}/`);
}

/** A member's photos, for a trainer or admin writing their plan. */
export async function listMemberBodyPhotos(userId) {
  const { data } = await axiosClient.get(`/users/${userId}/body-photos/`);
  return data.results ?? data;
}

/** The image bytes for one photo, as a Blob. `version` (the photo's
 *  uploaded_at) rides along as a query string: a replaced photo keeps its
 *  id, so the URL has to change some other way to be fetched afresh. */
export async function getBodyPhotoBlob(photoId, version) {
  const { data } = await axiosClient.get(`/body-photos/${photoId}/file/`, {
    params: version ? { v: version } : undefined,
    responseType: "blob",
  });
  return data;
}

// ---- Body photo examples (the gym's "shoot it like this" references) ----
//
// Gym-wide, one per pose, posed by a trainer. Any signed-in user can read
// them (members need them — they're the instructions); only trainers and
// admins set them. Same private storage as members' own photos, so the
// bytes come through getBodyPhotoExampleBlob rather than a plain src.

export async function listBodyPhotoExamples() {
  const { data } = await axiosClient.get("/body-photo-examples/");
  return data.results ?? data;
}

/** Upload or replace the example for one pose. Trainer/admin only. */
export async function uploadBodyPhotoExample(pose, file) {
  const form = new FormData();
  form.append("pose", pose);
  form.append("image", file);
  const { data } = await axiosClient.post("/body-photo-examples/", form);
  return data;
}

export async function deleteBodyPhotoExample(exampleId) {
  await axiosClient.delete(`/body-photo-examples/${exampleId}/`);
}

/** Same `version` idea as getBodyPhotoBlob, and it matters more here:
 *  examples are cached for ten minutes, so a re-shot example would
 *  otherwise keep showing the old picture from the browser's cache. */
export async function getBodyPhotoExampleBlob(exampleId, version) {
  const { data } = await axiosClient.get(`/body-photo-examples/${exampleId}/file/`, {
    params: version ? { v: version } : undefined,
    responseType: "blob",
  });
  return data;
}
