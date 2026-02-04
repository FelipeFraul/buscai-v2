import { apiClient } from "@/lib/api/client";
import { createQuery } from "@/lib/api/hooks";
import type { components } from "@/lib/api/types";

type PaginatedCompanies = components["schemas"]["PaginatedCompanies"];

const companiesQuery = createQuery<PaginatedCompanies>({
  queryKey: ["companies"],
  queryFn: async () => {
    const response = await apiClient.get("/companies");
    return response.data;
  },
});

export const useCompanies = () =>
  companiesQuery(undefined, {
    staleTime: 30_000,
  });
