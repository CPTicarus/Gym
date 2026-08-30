import axios from "axios";

import { clearTokens, getTokens, setTokens } from "./tokenStorage.js";

const baseURL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api";

const axiosClient = axios.create({ baseURL });

axiosClient.interceptors.request.use((config) => {
  const { access } = getTokens();
  if (access) {
    config.headers.Authorization = `Bearer ${access}`;
  }
  return config;
});

let refreshPromise = null;

async function refreshAccessToken() {
  const { refresh } = getTokens();
  if (!refresh) {
    throw new Error("No refresh token available");
  }

  // Multiple requests can 401 at once (e.g. a page firing several calls on
  // load) — dedupe them into a single refresh call instead of racing.
  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${baseURL}/auth/refresh/`, { refresh })
      .then(({ data }) => {
        setTokens({ access: data.access });
        return data.access;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

axiosClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { response, config } = error;

    if (response?.status === 401 && config && !config._retry) {
      config._retry = true;
      try {
        const newAccess = await refreshAccessToken();
        config.headers.Authorization = `Bearer ${newAccess}`;
        return axiosClient(config);
      } catch {
        clearTokens();
        if (window.location.pathname !== "/login") {
          window.location.href = "/login";
        }
      }
    }

    return Promise.reject(error);
  }
);

export default axiosClient;
