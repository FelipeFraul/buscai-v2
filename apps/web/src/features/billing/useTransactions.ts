import { apiClient } from "@/lib/api/client";
import { createQuery } from "@/lib/api/hooks";
import type { components } from "@/lib/api/types";

type Transaction = components["schemas"]["Transaction"];

const transactionsQuery = createQuery<Transaction[], string>({
  queryKey: (companyId) => ["billing", "transactions", companyId],
  queryFn: async (companyId) => {
    const response = await apiClient.get("/billing/transactions", {
      params: { companyId },
    });
    return response.data;
  },
});

export const useTransactions = (companyId?: string) =>
  transactionsQuery(companyId ?? "", {
    enabled: Boolean(companyId),
    staleTime: 15_000,
  });
