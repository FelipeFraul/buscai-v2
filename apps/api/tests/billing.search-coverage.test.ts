import { describe, expect, it } from "vitest";

import { BillingService } from "../src/modules/billing/billing.service";
import type { BillingRepository } from "../src/modules/billing/billing.repository";
import type { CompaniesRepository } from "../src/modules/companies/companies.repository";

class FakeBillingRepository implements Partial<BillingRepository> {
  private wallet: { balance: string; reserved: string } | null;

  constructor(wallet: { balance: string; reserved: string } | null) {
    this.wallet = wallet;
  }

  async getWalletByCompanyId() {
    return this.wallet as any;
  }
}

class FakeCompaniesRepository implements Partial<CompaniesRepository> {}

describe("BillingService.canCoverSearchChargeWithDebug", () => {
  it("returns no_wallet when wallet is missing", async () => {
    const repo = new FakeBillingRepository(null) as any;
    const companies = new FakeCompaniesRepository() as any;
    const service = new BillingService(repo, companies);

    const result = await service.canCoverSearchChargeWithDebug({
      companyId: "c1",
      amount: 100,
    });

    expect(result.ok).toBe(false);
    expect(result.walletExists).toBe(false);
    expect(result.reason).toBe("no_wallet");
  });

  it("returns ok when available balance covers amount", async () => {
    const repo = new FakeBillingRepository({ balance: "1000", reserved: "200" }) as any;
    const companies = new FakeCompaniesRepository() as any;
    const service = new BillingService(repo, companies);

    const result = await service.canCoverSearchChargeWithDebug({
      companyId: "c1",
      amount: 500,
    });

    expect(result.ok).toBe(true);
    expect(result.available).toBe(800);
    expect(result.reason).toBe("ok");
  });

  it("returns insufficient_available when reserved eats balance", async () => {
    const repo = new FakeBillingRepository({ balance: "500", reserved: "490" }) as any;
    const companies = new FakeCompaniesRepository() as any;
    const service = new BillingService(repo, companies);

    const result = await service.canCoverSearchChargeWithDebug({
      companyId: "c1",
      amount: 20,
    });

    expect(result.ok).toBe(false);
    expect(result.available).toBe(10);
    expect(result.reason).toBe("insufficient_available");
  });
});
