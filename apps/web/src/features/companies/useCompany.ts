import { apiClient } from "@/lib/api/client";
import { createQuery } from "@/lib/api/hooks";
import type { components } from "@/lib/api/types";

type Company = components["schemas"]["Company"];

const companyQuery = createQuery<Company, string>({
  queryKey: (companyId) => ["companies", companyId],
  queryFn: async (companyId) => {
    const response = await apiClient.get(`/companies/${companyId}`);
    return response.data;
  },
});

export const useCompany = (companyId?: string) =>
  companyQuery(companyId ?? "", {
    enabled: Boolean(companyId && companyId !== "new"),
  });
