import axios from "axios";

import { clearTokens, getTokens, setTokens } from "./tokenStorage.js";

const baseURL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api";

const axiosClient = axios.create({ baseURL });

// Fired when a plan endpoint answers 402: in a self sign-up gym the member
// hasn't paid (PlansUnlocked on the backend). AuthContext listens for it.
export const PAYMENT_REQUIRED_EVENT = "gym:payment-required";

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

    // The profile the app holds can be behind the server here, e.g. a
    // membership that lapsed after it was fetched. Saying so lets
    // AuthContext re-read it, so the plan pages show the locked page
    // instead of a load error.
    if (response?.status === 402) {
      window.dispatchEvent(new Event(PAYMENT_REQUIRED_EVENT));
    }

    return Promise.reject(error);
  }
);

export default axiosClient;
