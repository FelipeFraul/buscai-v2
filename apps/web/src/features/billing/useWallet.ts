import { apiClient } from "@/lib/api/client";
import { createQuery } from "@/lib/api/hooks";
import type { components } from "@/lib/api/types";

type Wallet = components["schemas"]["Wallet"];

const walletQuery = createQuery<Wallet, string>({
  queryKey: (companyId) => ["billing", "wallet", companyId],
  queryFn: async (companyId) => {
    const response = await apiClient.get("/billing/wallet", {
      params: { companyId },
    });
    return response.data;
  },
});

export const useWallet = (companyId?: string) =>
  walletQuery(companyId ?? "", {
    enabled: Boolean(companyId),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchInterval: 10000,
  });
