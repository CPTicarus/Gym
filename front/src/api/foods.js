import { sortByName } from "../utils/search.js";
import axiosClient from "./axiosClient.js";

export async function listFoods(params = {}) {
  const { data } = await axiosClient.get("/foods/", { params });
  return data; // DRF paginated: { count, next, previous, results }
}

/**
 * The whole library, in Persian alphabetical order — the food picker and
 * the library page both filter it in the browser, so they want everything
 * up front. The foods endpoint takes a page_size (unlike moves), so this is
 * one request for any realistic library; the page walk is only a backstop,
 * capped so a runaway loop can't hang the page.
 */
export async function fetchAllFoods() {
  const all = [];
  for (let page = 1; page <= 20; page += 1) {
    const data = await listFoods({ page, page_size: 1000 });
    all.push(...(data.results ?? data));
    if (!data.next) break;
  }
  return sortByName(all);
}

export async function createFood(payload) {
  const { data } = await axiosClient.post("/foods/", payload);
  return data;
}

export async function updateFood(foodId, payload) {
  const { data } = await axiosClient.patch(`/foods/${foodId}/`, payload);
  return data;
}

/**
 * Refused with a 409 while any diet plan uses the food; the response's
 * `plans` then lists their names.
 */
export async function deleteFood(foodId) {
  await axiosClient.delete(`/foods/${foodId}/`);
}
