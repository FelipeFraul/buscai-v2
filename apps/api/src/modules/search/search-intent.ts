import { SearchRequestSchema } from "@buscai/shared-schema";
import { z } from "zod";

import { normalizeForMatch, tokenizeSearch } from "./search-text";

type SearchRequest = z.infer<typeof SearchRequestSchema>;

type CityLike = {
  id: string;
  name: string;
  state?: string | null;
};

export type ParsedSearchIntent = {
  rawQuery: string;
  normalizedText: string;
  tokens: string[];
  inferredCityId?: string;
  inferredNicheId?: string;
  flags: {
    nearMe: boolean;
    hasCityInText: boolean;
  };
};

const NEAR_ME_PATTERNS = [
  "perto de mim",
  "perto",
  "perto de",
  "na minha cidade",
  "na minha localidade",
  "minha cidade",
  "minha localidade",
  "perto de casa",
  "perto de mim",
];

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function detectCityInQuery(query: string, cities: CityLike[]): string | undefined {
  if (!cities.length) return undefined;
  const normalizedQuery = normalizeForMatch(query);

  for (const city of cities) {
    const normalizedCity = normalizeForMatch(city.name);
    const regex = new RegExp(`\\b${escapeRegex(normalizedCity)}\\b`, "i");
    if (regex.test(normalizedQuery)) {
      return city.id;
    }
  }

  return undefined;
}

function detectNearMe(query: string): boolean {
  const normalized = normalizeForMatch(query);
  return NEAR_ME_PATTERNS.some((pattern) =>
    normalized.includes(normalizeForMatch(pattern))
  );
}

function tokenize(query: string): string[] {
  return tokenizeSearch(query);
}

export function parseSearchIntent(input: SearchRequest & { cities?: CityLike[] }): ParsedSearchIntent {
  const rawQuery = input.query ?? "";
  const tokens = tokenize(rawQuery);

  const inferredCityId = input.cities ? detectCityInQuery(rawQuery, input.cities) : undefined;
  const nearMe = detectNearMe(rawQuery);

  const normalizedText = tokens.join(" ");

  return {
    rawQuery,
    normalizedText,
    tokens,
    inferredCityId,
    inferredNicheId: undefined,
    flags: {
      nearMe,
      hasCityInText: Boolean(inferredCityId),
    },
  };
}
