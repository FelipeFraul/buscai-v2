import { useMutation, useQuery } from "@tanstack/react-query";

import { fetchCompanyNiches, updateNicheStatus } from "./api";
import type { CompanyNiche } from "./types";

export const useNiches = () => {
  const nichesQuery = useQuery({
    queryKey: ["company-niches"],
    queryFn: fetchCompanyNiches,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ nicheId, status }: { nicheId: string; status: "ativo" | "inativo" }) =>
      updateNicheStatus(nicheId, status),
    onSuccess: () => nichesQuery.refetch(),
  });

  const toggleStatus = async (niche: CompanyNiche) => {
    const nextStatus = niche.status === "ativo" ? "inativo" : "ativo";
    try {
      await toggleMutation.mutateAsync({ nicheId: niche.nicheId, status: nextStatus });
      return true;
    } catch (error) {
      console.error("Erro ao atualizar nicho", error);
      return false;
    }
  };

  return {
    niches: nichesQuery.data ?? [],
    loading: nichesQuery.isLoading,
    error: nichesQuery.error,
    refetch: nichesQuery.refetch,
    toggleStatus,
  };
};
