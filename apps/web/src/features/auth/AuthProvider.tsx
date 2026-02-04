import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import {
  apiClient,
  clearAuthTokens,
  registerAuthHandlers,
  setAuthTokens,
} from "@/lib/api/client";

import {
  AuthContext,
  type AuthContextValue,
  type User,
} from "./AuthContext";

const STORAGE_KEY = "buscai.session";

type StoredSession = {
  accessToken: string;
  refreshToken: string;
  user?: User | null;
};

const parseJwtPayload = (token: string | null): { companyId?: string } | null => {
  if (!token) {
    return null;
  }
  const parts = token.split(".");
  if (parts.length < 2) {
    return null;
  }
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const json = atob(padded);
    return JSON.parse(json) as { companyId?: string };
  } catch {
    return null;
  }
};

const readStoredSession = (): StoredSession | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed.accessToken || !parsed.refreshToken) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const stored = readStoredSession();
  // Ensure API client has tokens before any child queries fire.
  if (stored?.accessToken || stored?.refreshToken) {
    setAuthTokens({
      accessToken: stored.accessToken ?? null,
      refreshToken: stored.refreshToken ?? null,
    });
  }
  const [token, setToken] = useState<string | null>(stored?.accessToken ?? null);
  const [refreshToken, setRefreshToken] = useState<string | null>(
    stored?.refreshToken ?? null
  );
  const [user, setUser] = useState<User | null>(stored?.user ?? null);
  const lastRefreshAttempt = useRef<string | null>(null);

  const persistSession = useCallback(
    (session: StoredSession | null) => {
      if (!session) {
        localStorage.removeItem(STORAGE_KEY);
        return;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    },
    []
  );

  const clearSession = useCallback(() => {
    setToken(null);
    setRefreshToken(null);
    setUser(null);
    clearAuthTokens();
    persistSession(null);
    window.location.href = "/login";
  }, [persistSession]);

  useEffect(() => {
    registerAuthHandlers({
      onLogout: clearSession,
      onTokenRefresh: ({ accessToken, refreshToken: nextRefreshToken }) => {
        const resolvedRefreshToken = nextRefreshToken ?? refreshToken;
        if (!resolvedRefreshToken) {
          clearSession();
          return;
        }
        setToken(accessToken);
        setRefreshToken(resolvedRefreshToken);
        persistSession({
          accessToken,
          refreshToken: resolvedRefreshToken,
          user,
        });
      },
    });
  }, [clearSession, persistSession, refreshToken, user]);

  useEffect(() => {
    setAuthTokens({ accessToken: token, refreshToken });
  }, [token, refreshToken]);

  const hasCompanyId = Boolean(parseJwtPayload(token)?.companyId);
  const shouldSkipCompanyRefresh = hasCompanyId || user?.role === "admin";

  useEffect(() => {
    if (!token || !refreshToken || shouldSkipCompanyRefresh) {
      return;
    }
    if (lastRefreshAttempt.current === refreshToken) {
      return;
    }
    lastRefreshAttempt.current = refreshToken;
    void apiClient
      .post("/auth/refresh", { refreshToken })
      .then((response) => {
        const nextAccessToken = response.data?.accessToken as string | undefined;
        const nextRefreshToken = response.data?.refreshToken as string | undefined;
        if (!nextAccessToken) {
          return;
        }
        setToken(nextAccessToken);
        setRefreshToken(nextRefreshToken ?? refreshToken);
        persistSession({
          accessToken: nextAccessToken,
          refreshToken: nextRefreshToken ?? refreshToken,
          user,
        });
      })
      .catch(() => null);
  }, [token, refreshToken, shouldSkipCompanyRefresh, persistSession, user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      refreshToken,
      user,
      isAuthenticated: Boolean(token),
      setSession: ({ accessToken, refreshToken: incomingRefresh, user: currentUser }) => {
        setToken(accessToken);
        setRefreshToken(incomingRefresh);
        setUser(currentUser ?? null);
        setAuthTokens({ accessToken, refreshToken: incomingRefresh });
        persistSession({
          accessToken,
          refreshToken: incomingRefresh,
          user: currentUser ?? null,
        });
      },
      logout: clearSession,
    }),
    [token, refreshToken, user, persistSession, clearSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
