import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { apiClient } from "@/lib/api/client";
import { createMutation } from "@/lib/api/hooks";
import type { paths } from "@/lib/api/types";

import { useAuth } from "./AuthContext";

type LoginRequest =
  paths["/auth/login"]["post"]["requestBody"]["content"]["application/json"];
type LoginResponse =
  paths["/auth/login"]["post"]["responses"]["200"]["content"]["application/json"];

const loginMutation = createMutation<LoginResponse, LoginRequest>({
  mutationKey: ["auth", "login"],
  mutationFn: async (payload) => {
    const response = await apiClient.post("/auth/login", payload);
    return response.data;
  },
});

export const useLogin = () => {
  const auth = useAuth();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);

  const mutation = loginMutation({
    onSuccess: (data) => {
      if (data.accessToken && data.refreshToken) {
        auth.setSession({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          user: data.user ?? null,
        });
      const target = "/leilao";
        navigate(target, { replace: true });
      } else {
        setFormError("Resposta de login inválida.");
      }
    },
    onError: (error) => {
      console.error("Erro ao fazer login", error);
      setFormError("Não foi possível entrar. Verifique seus dados e tente novamente.");
    },
  });

  return { formError, mutation };
};
