import axiosClient from "./axiosClient.js";

export async function listMoves(params = {}) {
  const { data } = await axiosClient.get("/moves/", { params });
  return data; // DRF paginated: { count, next, previous, results }
}

/**
 * Every move, across all pages — the plan builders need the whole library
 * in one <select>, but DRF paginates at 20 and the backend doesn't expose
 * a page_size query param, so we walk the pages.
 *
 * Capped at 25 pages (~500 moves) so a runaway loop can't hang the page.
 * If a gym ever outgrows that, the better fix is a search-as-you-type
 * picker rather than raising the cap.
 */
export async function fetchAllMoves() {
  const all = [];
  for (let page = 1; page <= 25; page += 1) {
    const data = await listMoves({ page });
    const results = data.results ?? data;
    all.push(...results);
    if (!data.next) break;
  }
  return all;
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
