import { apiClient } from "@/lib/api/client";
import { createQuery } from "@/lib/api/hooks";
import type { components } from "@/lib/api/types";

type City = components["schemas"]["City"];
type Niche = components["schemas"]["Niche"];

const citiesQuery = createQuery<City[]>({
  queryKey: ["catalog", "cities"],
  queryFn: async () => {
    const response = await apiClient.get("/cities");
    return response.data;
  },
});

const nichesQuery = createQuery<Niche[]>({
  queryKey: ["catalog", "niches"],
  queryFn: async () => {
    const response = await apiClient.get("/niches");
    return response.data;
  },
});

export const useCities = () =>
  citiesQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });

export const useNiches = () =>
  nichesQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });
