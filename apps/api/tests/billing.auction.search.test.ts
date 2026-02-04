import { describe, expect, it } from "vitest";

import { SearchService } from "../src/modules/search/search.service";
import type { AuctionRanking } from "../src/modules/auction/auction.service";
import type { SearchRepository } from "../src/modules/search/search.repository";
import type { InternalAuditService } from "../src/modules/internal-audit/internal-audit.service";
import type { BillingService } from "../src/modules/billing/billing.service";
import type { ContactService } from "../src/modules/contacts/contact.service";

class FakeSearchRepository implements Partial<SearchRepository> {
  savedResults: any[] = [];

  async findCityById() {
    return { id: "city-1", name: "City", state: "ST" } as any;
  }

  async findNicheById() {
    return { id: "niche-1", label: "Niche", slug: "niche" } as any;
  }

  async listCities() {
    return [{ id: "city-1", name: "City", state: "ST" }] as any;
  }

  async findCompaniesByIds(ids: string[]) {
    return ids.map((id) => ({
      company: {
        id,
        tradeName: `Company ${id}`,
        legalName: null,
        cityId: "city-1",
        address: null,
        phone: "123",
        whatsapp: "456",
        openingHours: null,
        status: "active",
        createdAt: new Date(),
      },
      city: { id: "city-1", name: "City", state: "ST" },
      niches: [{ id: "niche-1", label: "Niche", slug: "niche", isActive: true }],
    }));
  }

  async saveSearchWithResults(params: { search: any; results: any[] }) {
    this.savedResults = params.results;
  }
}

class FakeAuctionService {
  constructor(private readonly ranking: AuctionRanking) {}
  async getSearchRanking() {
    return this.ranking;
  }
}

class FakeBillingService implements Partial<BillingService> {
  public checks: Array<{ companyId: string; amount: number }> = [];
  constructor(private balances: Record<string, number>) {}

  async canCoverSearchCharge(params: { companyId: string; amount: number }) {
    this.checks.push(params);
    const balance = this.balances[params.companyId] ?? 0;
    return balance >= params.amount;
  }

  async canCoverSearchChargeWithDebug(params: { companyId: string; amount: number }) {
    this.checks.push(params);
    const balance = this.balances[params.companyId] ?? 0;
    const reserved = 0;
    const available = balance - reserved;
    const ok = available >= params.amount;
    return {
      ok,
      balance,
      reserved,
      available,
      walletExists: true,
      reason: ok ? "ok" : "insufficient_available",
    };
  }
}

const auditStub: InternalAuditService = {
  logEvent: async () => undefined,
} as any;

const contactStub: ContactService = {
  recordContact: async () => undefined,
} as any;

describe("Billing + auction + search_debit safeguards", () => {
  it("charges only top 3 paid positions with sufficient balance", async () => {
    const repo = new FakeSearchRepository();
    const billing = new FakeBillingService({ c1: 1000, c2: 1000, c3: 1000 });
    const auction = new FakeAuctionService({
      paid: {
        1: [{ companyId: "c1", bids: { 1: 300, 2: undefined, 3: undefined }, company: {} as any }],
        2: [{ companyId: "c2", bids: { 1: undefined, 2: 200, 3: undefined }, company: {} as any }],
        3: [{ companyId: "c3", bids: { 1: undefined, 2: undefined, 3: 100 }, company: {} as any }],
      },
      organicPool: [],
    });

    const service = new SearchService(repo as any, auction as any, billing as any, auditStub, contactStub);
    const res = await service.search({ cityId: "city-1", nicheId: "niche-1", source: "web" } as any);

    expect(res.results).toHaveLength(3);
    const paid = res.results.filter((r) => r.isPaid);
    expect(paid).toHaveLength(3);
    expect(paid.map((r) => r.position)).toEqual([1, 2, 3]);
    expect(billing.checks).toHaveLength(3);
  });

  it("skips paid result when balance is insufficient", async () => {
    const repo = new FakeSearchRepository();
    const billing = new FakeBillingService({ c1: 100 });
    const auction = new FakeAuctionService({
      paid: {
        1: [{ companyId: "c1", bids: { 1: 300, 2: undefined, 3: undefined }, company: {} as any }],
        2: [],
        3: [],
      },
      organicPool: [],
    });

    const service = new SearchService(repo as any, auction as any, billing as any, auditStub, contactStub);
    const res = await service.search({ cityId: "city-1", nicheId: "niche-1", source: "web" } as any);

    expect(res.results.filter((r) => r.isPaid)).toHaveLength(0);
    expect(billing.checks).toHaveLength(1);
  });

  it("skips paid result when balance is zero", async () => {
    const repo = new FakeSearchRepository();
    const billing = new FakeBillingService({ c1: 0 });
    const auction = new FakeAuctionService({
      paid: {
        1: [{ companyId: "c1", bids: { 1: 50, 2: undefined, 3: undefined }, company: {} as any }],
        2: [],
        3: [],
      },
      organicPool: [],
    });

    const service = new SearchService(repo as any, auction as any, billing as any, auditStub, contactStub);
    const res = await service.search({ cityId: "city-1", nicheId: "niche-1", source: "web" } as any);

    expect(res.results.filter((r) => r.isPaid)).toHaveLength(0);
    expect(billing.checks).toHaveLength(1);
  });

  it("does not charge more than top 3 even with extra organic results", async () => {
    const repo = new FakeSearchRepository();
    const billing = new FakeBillingService({ c1: 100, c2: 100, c3: 100 });
    const auction = new FakeAuctionService({
      paid: {
        1: [{ companyId: "c1", bids: { 1: 10, 2: undefined, 3: undefined }, company: {} as any }],
        2: [{ companyId: "c2", bids: { 1: undefined, 2: 10, 3: undefined }, company: {} as any }],
        3: [{ companyId: "c3", bids: { 1: undefined, 2: undefined, 3: 10 }, company: {} as any }],
      },
      organicPool: [
        { id: "c4", tradeName: "Org 4" } as any,
        { id: "c5", tradeName: "Org 5" } as any,
      ],
    });

    const service = new SearchService(repo as any, auction as any, billing as any, auditStub, contactStub);
    const res = await service.search({ cityId: "city-1", nicheId: "niche-1", source: "web" } as any);

    const paid = res.results.filter((r) => r.isPaid);
    const organic = res.results.filter((r) => !r.isPaid);
    expect(paid).toHaveLength(3);
    expect(organic.length).toBeLessThanOrEqual(2);
    expect(billing.checks).toHaveLength(3);
  });
});
