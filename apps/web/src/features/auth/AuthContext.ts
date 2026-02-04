import { createContext, useContext } from "react";

import type { components } from "@/lib/api/types";

export type User = components["schemas"]["User"];

export type AuthContextValue = {
  token: string | null;
  refreshToken: string | null;
  user: User | null;
  isAuthenticated: boolean;
  setSession: (session: {
    accessToken: string;
    refreshToken: string;
    user?: User | null;
  }) => void;
  logout: () => void;
};

export const AuthContext = createContext<AuthContextValue | undefined>(
  undefined
);

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
};
