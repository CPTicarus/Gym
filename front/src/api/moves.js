import { sortByName } from "../utils/search.js";
import axiosClient from "./axiosClient.js";

export async function listMoves(params = {}) {
  const { data } = await axiosClient.get("/moves/", { params });
  return data; // DRF paginated: { count, next, previous, results }
}

/**
 * The whole library, in Persian alphabetical order — the move library page
 * and the plan builder's picker both filter it in the browser. The moves
 * endpoint takes a page_size (see apps/pagination.py), so this is one
 * request for any realistic library; the page walk is only a backstop,
 * capped so a runaway loop can't hang the page.
 */
export async function fetchAllMoves() {
  const all = [];
  for (let page = 1; page <= 20; page += 1) {
    const data = await listMoves({ page, page_size: 1000 });
    all.push(...(data.results ?? data));
    if (!data.next) break;
  }
  return sortByName(all);
}

export async function getMove(moveId) {
  const { data } = await axiosClient.get(`/moves/${moveId}/`);
  return data;
}

export async function createMove(payload) {
  const { data } = await axiosClient.post("/moves/", payload);
  return data;
}

export async function updateMove(moveId, payload) {
  const { data } = await axiosClient.patch(`/moves/${moveId}/`, payload);
  return data;
}

/**
 * Takes the move's media with it. Refused with a 409 while any workout
 * plan uses the move; the response's `plans` then lists their names.
 */
export async function deleteMove(moveId) {
  await axiosClient.delete(`/moves/${moveId}/`);
}

/**
 * Attach one media item to a move. Pass either `file` (uploaded directly —
 * sent as multipart/form-data) or `externalUrl` (e.g. an unlisted
 * YouTube/Vimeo link — sent as JSON), never both.
 *
 * Whether it's an image, a GIF or a video isn't passed: the backend reads
 * that off the extension and returns it on the created item.
 */
export async function addMoveMedia(moveId, { file, externalUrl, caption, order }) {
  if (file) {
    const form = new FormData();
    form.append("file", file);
    if (caption) form.append("caption", caption);
    if (order !== undefined) form.append("order", order);
    const { data } = await axiosClient.post(`/moves/${moveId}/media/`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data;
  }

  const { data } = await axiosClient.post(`/moves/${moveId}/media/`, {
    external_url: externalUrl,
    caption,
    order,
  });
  return data;
}

/**
 * Persist a new display order for a move's media. Takes the full list of
 * ids in their new order (the backend rejects a partial list — `order` is
 * a position within the whole list, so renumbering a subset would collide
 * with the items left out) and returns the reordered media.
 */
export async function reorderMoveMedia(moveId, mediaIds) {
  const { data } = await axiosClient.post(`/moves/${moveId}/media/reorder/`, { order: mediaIds });
  return data;
}

export async function deleteMoveMedia(moveId, mediaId) {
  await axiosClient.delete(`/moves/${moveId}/media/${mediaId}/`);
}

/**
 * Upload size caps, in bytes, keyed by media type:
 * `{ image: { warn_bytes, max_bytes }, gif: {...}, video: {...} }`.
 *
 * Fetched rather than hardcoded because a gym can tighten or loosen them
 * in its own .env — a second copy in the frontend would quietly disagree
 * with what the server actually enforces.
 */
export async function getMediaLimits() {
  const { data } = await axiosClient.get("/moves/media-limits/");
  return data;
}
