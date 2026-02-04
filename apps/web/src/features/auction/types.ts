export interface Wallet {
  saldo: number;
}

export interface BillingTransaction {
  id: string;
  data: string;
  tipo: "credito" | "debito";
  valor: number;
  descricao: string;
}

export interface PurchaseResponse {
  saldo: number;
  creditosAdicionados: number;
}
