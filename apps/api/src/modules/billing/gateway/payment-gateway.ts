export type PaymentChargeRequest = {
  companyId: string;
  amountCents: number;
  customerId: string;
  paymentMethodId: string;
  idempotencyKey: string;
  description?: string;
  metadata?: Record<string, unknown>;
};

export type PaymentChargeResult = {
  externalId: string;
  status: "paid" | "failed";
};

export interface PaymentGateway {
  createCharge(request: PaymentChargeRequest): Promise<PaymentChargeResult>;
}
