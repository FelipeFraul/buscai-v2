import { useMutation, useQuery } from "@tanstack/react-query";

import { fetchTransactions, fetchWallet, purchaseCredits } from "./api";

export const useAuction = (companyId?: string) => {
  const walletQuery = useQuery({
    queryKey: ["billing", "wallet", companyId ?? "default"],
    queryFn: () => fetchWallet(companyId),
    refetchOnWindowFocus: true,
    refetchInterval: 10000,
  });

  const transactionsQuery = useQuery({
    queryKey: ["billing", "transactions", companyId ?? "default"],
    queryFn: () => fetchTransactions(companyId),
  });

  const purchaseMutation = useMutation({
    mutationFn: (plano: string) => purchaseCredits(plano, companyId),
    onSuccess: () => {
      walletQuery.refetch();
      transactionsQuery.refetch();
    },
  });

  return {
    wallet: walletQuery.data ?? { saldo: 0 },
    transactions: transactionsQuery.data ?? [],
    loading: walletQuery.isLoading || transactionsQuery.isLoading,
    error: walletQuery.error || transactionsQuery.error,
    refetch: () => {
      walletQuery.refetch();
      transactionsQuery.refetch();
    },
    buy: async (plano: string) => {
      try {
        await purchaseMutation.mutateAsync(plano);
        return true;
      } catch (error) {
        console.error("Erro ao comprar créditos", error);
        return false;
      }
    },
  };
};
