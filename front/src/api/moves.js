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
 * Attach one media item (image or video) to a move. Pass either `file`
 * (uploaded directly — sent as multipart/form-data) or `externalUrl`
 * (e.g. an unlisted YouTube/Vimeo link — sent as JSON), never both.
 */
export async function addMoveMedia(moveId, { file, externalUrl, mediaType, caption, order }) {
  if (file) {
    const form = new FormData();
    form.append("media_type", mediaType);
    form.append("file", file);
    if (caption) form.append("caption", caption);
    if (order !== undefined) form.append("order", order);
    const { data } = await axiosClient.post(`/moves/${moveId}/media/`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data;
  }

  const { data } = await axiosClient.post(`/moves/${moveId}/media/`, {
    media_type: mediaType,
    external_url: externalUrl,
    caption,
    order,
  });
  return data;
}
