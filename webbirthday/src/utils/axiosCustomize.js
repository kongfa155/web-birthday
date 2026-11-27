import axios from "axios";
import NProgress from "nprogress";

NProgress.configure({
  showSpinner: false,
  trickleSpeed: 100,
});

const instance = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/",
});

const isAuthEndpoint = (url = "") => {
  return /\/api\/users\/(login|register|google(?:\/challenge)?)\/?(?:\?|$)/.test(url);
};

// Add a request interceptor
instance.interceptors.request.use(
  function (config) {
    NProgress.start();
    // Do not attach stale token to login or register requests
    if (!isAuthEndpoint(config.url)) {
      try {
        const token = localStorage.getItem("token");
        if (token) {
          config.headers = config.headers || {};
          config.headers.Authorization = `Bearer ${token}`;
          config._authToken = token;
        }
      } catch (err) {
        console.error("Error reading token from localStorage", err);
      }
    }
    return config;
  },
  function (error) {
    NProgress.done();
    return Promise.reject(error);
  }
);

// Add a response interceptor
instance.interceptors.response.use(
  function (response) {
    NProgress.done();
    return response;
  },
  function (error) {
    NProgress.done();

    const requestUrl = error.config?.url || "";
    const isAuth = isAuthEndpoint(requestUrl);

    // 401 on protected calls or 403 ACCOUNT_DISABLED clear storage and dispatch auth:unauthorized.
    // Incorrect login/register is a local error with no global redirect.
    if (!isAuth && error.response) {
      const status = error.response.status;
      const code = error.response.data?.code;

      if (status === 401 || (status === 403 && code === "ACCOUNT_DISABLED")) {
        // An old request must never invalidate a newer login.
        let currentToken;
        try { currentToken = localStorage.getItem("token"); } catch { return Promise.reject(error); }
        if (!error.config?._authToken || error.config._authToken !== currentToken) return Promise.reject(error);
        try {
          localStorage.removeItem("token");
          localStorage.removeItem("user");
        } catch {
          // ignore localStorage access errors
        }

        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("auth:unauthorized", {
              detail: error.response.data,
            })
          );
        }
      }
    }

    return Promise.reject(error);
  }
);

export default instance;
