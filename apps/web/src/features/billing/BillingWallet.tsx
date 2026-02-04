import { Button } from "@/components/ui/Button";
import { formatCurrencyFromCents } from "@/lib/utils";
import { useWallet } from "./useWallet";

type BillingWalletProps = {
  companyId?: string;
  onRefresh?: () => void;
};

export const BillingWallet = ({ companyId, onRefresh }: BillingWalletProps) => {
  const walletQuery = useWallet(companyId);

  if (!companyId) {
    return (
      <p className="text-sm text-slate-500">
        Selecione uma empresa para visualizar a carteira.
      </p>
    );
  }

  if (walletQuery.isLoading) {
    return <p className="text-sm text-slate-500">Carregando carteira...</p>;
  }

  if (!walletQuery.data) {
    return <p className="text-sm text-slate-500">Carteira indisponível.</p>;
  }

  const handleRefresh = () => {
    walletQuery.refetch();
    onRefresh?.();
  };

  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900">Carteira</h3>
        <Button size="sm" variant="outline" onClick={handleRefresh}>
          Atualizar
        </Button>
      </div>
      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-slate-500">Saldo</dt>
          <dd className="font-semibold text-slate-900">
            {formatCurrencyFromCents(Number(walletQuery.data.balance ?? 0))}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-500">Reservado</dt>
          <dd className="font-semibold text-slate-900">
            {formatCurrencyFromCents(Number(walletQuery.data.reserved ?? 0))}
          </dd>
        </div>
      </dl>
    </div>
  );
};
