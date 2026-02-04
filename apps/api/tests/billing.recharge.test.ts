import { describe, expect, it } from "vitest";

import { BillingService } from "../src/modules/billing/billing.service";
import type { BillingRepository } from "../src/modules/billing/billing.repository";
import type { CompaniesRepository } from "../src/modules/companies/companies.repository";

class FakeBillingRepository implements Partial<BillingRepository> {
  wallet = { companyId: "c1", balance: "0", reserved: "0", id: "w1" } as any;
  transactions: any[] = [];

  async getWalletByCompanyId() {
    return this.wallet;
  }

  async createWallet() {
    return this.wallet;
  }

  async createRecharge(params: { companyId: string; amount: number }) {
    const tx = {
      id: `tx-${this.transactions.length + 1}`,
      companyId: params.companyId,
      amount: params.amount.toString(),
      type: "recharge",
      status: "pending",
      occurredAt: new Date(),
    };
    this.transactions.push(tx);
    return tx as any;
  }

  async getTransactionById(id: string) {
    return this.transactions.find((t) => t.id === id);
  }

  async confirmRecharge(id: string) {
    const tx = this.transactions.find((t) => t.id === id);
    if (!tx) return { transaction: null, balance: null };
    if (tx.status === "pending") {
      tx.status = "confirmed";
      const next = Number(this.wallet.balance) + Number(tx.amount);
      this.wallet.balance = next.toString();
      return { transaction: tx, balance: next };
    }
    return { transaction: tx, balance: null };
  }
}

class FakeCompaniesRepository implements Partial<CompaniesRepository> {
  async getCompanyByIdForOwner(companyId: string, ownerId: string) {
    return { company: { id: companyId, ownerId } } as any;
  }
}

describe("Billing recharge flow", () => {
  const actor = { userId: "owner-1", role: "company_owner" as const };

  it("pending recharge does not change balance and confirmation credits wallet", async () => {
    const repo = new FakeBillingRepository() as any;
    const companies = new FakeCompaniesRepository() as any;
    const service = new BillingService(repo, companies);

    const intent = await service.createRechargeIntent(actor, { companyId: "c1", amount: 100 });
    expect(intent.status).toBe("pending");
    expect(Number(repo.wallet.balance)).toBe(0);

    const confirmed = await service.confirmRecharge(actor, { rechargeId: intent.id });
    expect(confirmed.status).toBe("confirmed");
    expect(confirmed.newBalance).toBe(100);
    expect(Number(repo.wallet.balance)).toBe(100);
  });
});
