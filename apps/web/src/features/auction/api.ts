import { apiClient } from "@/lib/api/client";

import { type BillingTransaction, type PurchaseResponse, type Wallet } from "./types";

const numberOrZero = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const normalizeWallet = (raw: any): Wallet => ({
  saldo: numberOrZero(raw?.saldo ?? raw?.balance),
});

const normalizeTransaction = (raw: any): BillingTransaction => ({
  id: raw?.id ?? "",
  data: raw?.data ?? raw?.occurredAt ?? "",
  tipo: raw?.tipo === "debito" || raw?.type === "debit" ? "debito" : "credito",
  valor: numberOrZero(raw?.valor ?? raw?.amount),
  descricao: raw?.descricao ?? raw?.reason ?? "",
});

const normalizePurchase = (raw: any): PurchaseResponse => ({
  saldo: numberOrZero(raw?.saldo ?? raw?.balance),
  creditosAdicionados: numberOrZero(raw?.creditosAdicionados ?? raw?.credits ?? raw?.amount),
});

export async function fetchWallet(companyId?: string): Promise<Wallet> {
  const response = await apiClient.get("/billing/wallet", {
    params: companyId ? { companyId } : undefined,
  });
  return normalizeWallet(response.data ?? {});
}

export async function fetchTransactions(companyId?: string): Promise<BillingTransaction[]> {
  const response = await apiClient.get("/billing/transactions", {
    params: companyId ? { companyId } : undefined,
  });
  const items = Array.isArray(response.data) ? response.data : [];
  const normalized = items.map(normalizeTransaction);
  return normalized.sort((a, b) => (b.data ?? "").localeCompare(a.data ?? ""));
}

export async function purchaseCredits(
  plano: string,
  companyId?: string
): Promise<PurchaseResponse> {
  const response = await apiClient.post("/billing/purchase", {
    plano,
    companyId,
  });
  return normalizePurchase(response.data ?? {});
}
