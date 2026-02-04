import axios, { AxiosError, type AxiosRequestConfig } from "axios";

const baseURL = import.meta.env.VITE_WEB_API_URL ?? "/api";

type Tokens = {
  accessToken: string | null;
  refreshToken: string | null;
};

type RefreshResult = {
  accessToken: string;
  refreshToken?: string | null;
};

let tokens: Tokens = {
  accessToken: null,
  refreshToken: null,
};

let onLogout: (() => void) | null = null;
let onTokenRefresh: ((tokens: RefreshResult) => void) | null = null;
let refreshPromise: Promise<RefreshResult | null> | null = null;

export const setAuthTokens = (nextTokens: Tokens) => {
  tokens = nextTokens;
};

export const clearAuthTokens = () => {
  tokens = { accessToken: null, refreshToken: null };
};

export const registerAuthHandlers = (handlers: {
  onLogout?: () => void;
  onTokenRefresh?: (tokens: RefreshResult) => void;
}) => {
  onLogout = handlers.onLogout ?? null;
  onTokenRefresh = handlers.onTokenRefresh ?? null;
};

export const apiClient = axios.create({
  baseURL,
});

apiClient.interceptors.request.use((config) => {
  (config as any)._startTime = Date.now();
  if (tokens.accessToken) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${tokens.accessToken}`;
  }

  return config;
});

const refreshAccessToken = async (): Promise<RefreshResult | null> => {
  if (!tokens.refreshToken) {
    return null;
  }

  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = axios
    .post(`${baseURL}/auth/refresh`, { refreshToken: tokens.refreshToken })
    .then((response) => {
      const newAccessToken = response.data?.accessToken as string | undefined;
      const newRefreshToken = response.data?.refreshToken as string | undefined;
      if (newAccessToken) {
        const resolvedRefreshToken = newRefreshToken ?? tokens.refreshToken;
        tokens = {
          accessToken: newAccessToken,
          refreshToken: resolvedRefreshToken,
        };
        onTokenRefresh?.({
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
        });
        return { accessToken: newAccessToken, refreshToken: newRefreshToken };
      }
      return null;
    })
    .catch(() => null)
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
};

apiClient.interceptors.response.use(
  (response) => {
    const start = (response.config as any)._startTime;
    if (typeof start === "number") {
      const duration = Date.now() - start;
      if (duration > 800) {
        console.warn("Slow API call", { url: response.config.url, durationMs: duration });
      }
    }
    return response;
  },
  async (error: AxiosError) => {
    const status = error.response?.status;
    const originalRequest = error.config as (AxiosRequestConfig & {
      _retry?: boolean;
    }) | undefined;

    const start = (originalRequest as any)?._startTime;
    if (typeof start === "number") {
      const duration = Date.now() - start;
      if (duration > 800) {
        console.warn("Slow API call", { url: originalRequest?.url, durationMs: duration });
      }
    }

    if (status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;

      const refreshed = await refreshAccessToken();
      if (refreshed?.accessToken) {
        originalRequest.headers = originalRequest.headers ?? {};
        originalRequest.headers.Authorization = `Bearer ${refreshed.accessToken}`;
        return apiClient(originalRequest);
      }

      onLogout?.();
    }

    if (!status || status >= 500) {
      console.error("API error", {
        url: originalRequest?.url,
        status: status ?? "network_error",
        message: error.message,
      });
    }

    return Promise.reject(error);
  }
);
