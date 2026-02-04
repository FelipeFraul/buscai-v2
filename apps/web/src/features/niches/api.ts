import { apiClient } from "@/lib/api/client";

import { type CompanyNiche } from "./types";

const numberOrZero = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const normalizeNiche = (raw: any): CompanyNiche => ({
  nicheId: raw?.nicheId ?? "",
  nome: raw?.nome ?? "",
  status: raw?.status === "ativo" ? "ativo" : "inativo",
  buscas: numberOrZero(raw?.buscas),
  aparicoes: numberOrZero(raw?.aparicoes),
  cliques: numberOrZero(raw?.cliques),
  custo: numberOrZero(raw?.custo),
  ctr: numberOrZero(raw?.ctr),
});

export async function fetchCompanyNiches(): Promise<CompanyNiche[]> {
  const response = await apiClient.get("/company/niches");
  const items = Array.isArray(response.data) ? response.data : [];
  return items.map(normalizeNiche);
}

export async function updateNicheStatus(
  nicheId: string,
  status: "ativo" | "inativo"
): Promise<CompanyNiche> {
  const payload = { status: status === "ativo" ? "ativo" : "inativo" };
  const response = await apiClient.put(`/company/niches/${nicheId}`, payload);
  return normalizeNiche(response.data);
}
