import { apiClient } from "@/lib/api/client";

import { type PublicSearchResponse, type PublicSearchResult } from "./types";

const numberOrZero = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const normalizeResult = (raw: any): PublicSearchResult => {
  const posicao = numberOrZero(raw?.posicao ?? raw?.position ?? raw?.rank);
  const tipoRaw = raw?.tipo ?? raw?.type;
  const tipo: PublicSearchResult["tipo"] =
    tipoRaw === "oferecido"
      ? "oferecido"
      : posicao >= 1 && posicao <= 3
        ? "leilao"
        : "organico";

  return {
    companyId: raw?.companyId ?? raw?.id ?? "",
    empresa: raw?.empresa ?? raw?.company?.tradeName ?? raw?.company ?? "",
    produto: raw?.produto ?? raw?.product ?? "",
    posicao,
    tipo,
  };
};

export async function publicSearch(payload: {
  text: string;
  city: string;
  niche?: string;
  limit?: number;
}): Promise<PublicSearchResponse> {
  const trimmedText = payload.text.trim();
  const trimmedCity = payload.city.trim();
  if (!trimmedText || !trimmedCity) {
    return { searchId: "", results: [], offeredBy: undefined };
  }

  const response = await apiClient.post("/public/search", {
    text: trimmedText,
    city: trimmedCity,
    niche: payload.niche?.trim() || undefined,
    limit: payload.limit,
  });
  const items = Array.isArray(response.data?.results) ? response.data.results : [];
  type Normalized = ReturnType<typeof normalizeResult>;
  const normalized = items
    .map(normalizeResult)
    .sort((a: Normalized, b: Normalized) => a.posicao - b.posicao);
  const offeredBy = response.data?.offeredBy;
  const searchId = response.data?.searchId ?? "";
  return { results: normalized, offeredBy, searchId };
}
