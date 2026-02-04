import { useEffect } from "react";

import { useAuth } from "./AuthContext";

import { apiClient } from "@/lib/api/client";
import { createQuery } from "@/lib/api/hooks";
import type { components } from "@/lib/api/types";

type User = components["schemas"]["User"];

const useCurrentUserQuery = createQuery<User>({
  queryKey: ["auth", "me"],
  queryFn: async () => {
    const response = await apiClient.get("/auth/me");
    return response.data;
  },
});

export const useCurrentUser = () => {
  const { token, refreshToken, setSession, logout } = useAuth();

  const query = useCurrentUserQuery(undefined, {
    enabled: Boolean(token),
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (token && refreshToken && query.data) {
      setSession({
        accessToken: token,
        refreshToken,
        user: query.data,
      });
    }
  }, [token, refreshToken, query.data, setSession]);

  useEffect(() => {
    if (token && query.isError) {
      logout();
    }
  }, [token, query.isError, logout]);

  return query;
};
