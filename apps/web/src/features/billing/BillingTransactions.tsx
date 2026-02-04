import { formatCurrencyFromCents } from "@/lib/utils";
import { useTransactions } from "./useTransactions";

type BillingTransactionsProps = {
  companyId?: string;
};

type TransactionMeta = {
  reason?: string;
  searchId?: string;
  position?: number;
};

const formatReason = (transaction: {
  type?: string;
  reason?: string | null;
  metadata?: unknown;
}) => {
  const raw = transaction.reason?.trim() ?? "";
  let parsedMeta: TransactionMeta | undefined;

  if (raw.startsWith("{")) {
    try {
      parsedMeta = JSON.parse(raw) as TransactionMeta;
    } catch {
      parsedMeta = undefined;
    }
  }

  const meta = (parsedMeta ?? (transaction.metadata as TransactionMeta | undefined)) || {};
  const resolvedReason = meta.reason ?? raw;

  if (transaction.type === "search_debit" || resolvedReason === "search_debit") {
    const parts = ["Debito por impressao"];
    if (meta.position) parts.push(`posicao ${meta.position}`);
    if (meta.searchId) parts.push(`busca ${String(meta.searchId).slice(0, 8)}`);
    return parts.join(" · ");
  }

  if (transaction.type === "wallet_debit") return "Debito de carteira";
  if (transaction.type === "recharge") return "Recarga";
  if (transaction.type === "credit") return "Credito";
  if (resolvedReason) return resolvedReason;
  return "Sem descricao";
};

export const BillingTransactions = ({ companyId }: BillingTransactionsProps) => {
  const transactionsQuery = useTransactions(companyId);

  if (!companyId) {
    return (
      <p className="text-sm text-slate-500">
        Selecione uma empresa para visualizar o extrato.
      </p>
    );
  }

  if (transactionsQuery.isLoading) {
    return (
      <p className="text-sm text-slate-500">Carregando transacoes...</p>
    );
  }

  const transactions = transactionsQuery.data ?? [];

  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <h3 className="text-lg font-semibold text-slate-900">Transacoes</h3>
      <div className="mt-4 space-y-3">
        {transactions.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nenhuma transacao encontrada para esta empresa.
          </p>
        ) : (
          transactions.map((transaction) => {
            const rawAmount = transaction.amountCents ?? transaction.amount ?? 0;
            const amountCents = Math.abs(Number(rawAmount));
            const isCredit = transaction.type === "credit";

            return (
              <div
                key={transaction.id}
                className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium text-slate-900">
                    {formatReason(transaction)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {transaction.occurredAt
                      ? new Date(transaction.occurredAt).toLocaleString()
                      : "--"}
                  </p>
                </div>
                <span className={isCredit ? "text-emerald-600" : "text-rose-600"}>
                  {isCredit ? "+" : "-"} {formatCurrencyFromCents(amountCents)}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
