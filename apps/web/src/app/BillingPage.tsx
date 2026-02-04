import { BillingTransactions } from "@/features/billing/BillingTransactions";
import { BillingWallet } from "@/features/billing/BillingWallet";
import { CompanySelector } from "@/features/companies/CompanySelector";
import { useCompanySelection } from "@/features/companies/useCompanySelection";
import { queryClient } from "@/lib/api/queryClient";

export const BillingPage = () => {
  const {
    companies,
    isLoading,
    selectedCompanyId,
    setSelectedCompanyId,
  } = useCompanySelection();

  const handleRefresh = () => {
    if (!selectedCompanyId) return;
    queryClient.invalidateQueries({
      queryKey: ["billing", "wallet", selectedCompanyId],
    });
    queryClient.invalidateQueries({
      queryKey: ["billing", "transactions", selectedCompanyId],
    });
  };

  return (
    <div className="space-y-6">
      <CompanySelector
        companies={companies}
        isLoading={isLoading}
        value={selectedCompanyId}
        onChange={setSelectedCompanyId}
        label="Empresa para faturamento"
      />
      {selectedCompanyId ? (
        <div className="grid gap-6 md:grid-cols-2">
          <BillingWallet
            companyId={selectedCompanyId}
            onRefresh={handleRefresh}
          />
          <BillingTransactions companyId={selectedCompanyId} />
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          Cadastre ou selecione uma empresa para visualizar o faturamento.
        </p>
      )}
    </div>
  );
};
