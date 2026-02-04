import { describe, expect, it } from "vitest";

import { SearchService } from "../src/modules/search/search.service";
import type { AuctionRanking } from "../src/modules/auction/auction.service";
import type { SearchRepository } from "../src/modules/search/search.repository";
import type { InternalAuditService } from "../src/modules/internal-audit/internal-audit.service";
import type { BillingService } from "../src/modules/billing/billing.service";
import type { ContactService } from "../src/modules/contacts/contact.service";

class FakeSearchRepository implements Partial<SearchRepository> {
  public savedResults: Array<{
    searchId: string;
    companyId: string;
    position: number;
    isPaid: boolean;
    chargedAmount: string;
  }> = [];
  private impressionKeys = new Set<string>();

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
    this.savedResults = params.results.map((result) => ({
      searchId: result.searchId,
      companyId: result.companyId,
      position: result.position,
      isPaid: result.isPaid,
      chargedAmount: result.chargedAmount,
    }));
  }

  async searchEventExistsForCompany(searchId: string, companyId: string, type: string) {
    return this.impressionKeys.has(`${searchId}:${companyId}:${type}`);
  }

  async insertImpressionEventIfMissing(params: {
    searchId: string;
    companyId: string;
  }) {
    const key = `${params.searchId}:${params.companyId}:impression`;
    if (this.impressionKeys.has(key)) {
      return false;
    }
    this.impressionKeys.add(key);
    return true;
  }

  async deleteSearchEvent(params: { searchId: string; companyId: string; type: string }) {
    this.impressionKeys.delete(`${params.searchId}:${params.companyId}:${params.type}`);
  }

  async updateSearchResultPaidStatus(params: {
    searchId: string;
    companyId: string;
    isPaid: boolean;
    chargedAmount: number;
  }) {
    this.savedResults = this.savedResults.map((row) =>
      row.searchId === params.searchId && row.companyId === params.companyId
        ? {
            ...row,
            isPaid: params.isPaid,
            chargedAmount: params.chargedAmount.toString(),
          }
        : row
    );
  }
}

class FakeAuctionService {
  constructor(private readonly ranking: AuctionRanking) {}
  async getSearchRanking() {
    return this.ranking;
  }
}

class FakeBillingService implements Partial<BillingService> {
  public reserveCalls: Array<{ companyId: string; amount: number }> = [];
  public checks: Array<{ companyId: string; amount: number }> = [];
  public failCompanies = new Set<string>();

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

  async reserveSearchCharge(params: {
    companyId: string;
    amount: number;
    searchId: string;
    position: number;
  }) {
    this.reserveCalls.push({ companyId: params.companyId, amount: params.amount });
    if (this.failCompanies.has(params.companyId)) {
      return { status: "insufficient_funds", balance: 0 };
    }
    const balance = this.balances[params.companyId] ?? 0;
    if (balance < params.amount) {
      return { status: "insufficient_funds", balance };
    }
    this.balances[params.companyId] = balance - params.amount;
    return {
      status: "reserved",
      balance: this.balances[params.companyId],
      transaction: { id: "tx", companyId: params.companyId } as any,
    };
  }
}

const auditStub: InternalAuditService = {
  logEvent: async () => undefined,
} as any;

const contactStub: ContactService = {
  recordContact: async () => undefined,
} as any;

describe("Impression billing (WhatsApp)", () => {
  it("charges paid impression once and is idempotent", async () => {
    const repo = new FakeSearchRepository();
    const billing = new FakeBillingService({ c1: 1000 });
    const auction = new FakeAuctionService({
      paid: {
        1: [{ companyId: "c1", bids: { 1: 200, 2: undefined, 3: undefined }, company: {} as any }],
        2: [],
        3: [],
      },
      organicPool: [],
    });

    const service = new SearchService(repo as any, auction as any, billing as any, auditStub, contactStub);
    const res = await service.search({
      cityId: "city-1",
      nicheId: "niche-1",
      source: "whatsapp",
    } as any);

    expect(res.results.filter((r) => r.isPaid)).toHaveLength(1);
    expect(billing.reserveCalls).toHaveLength(1);

    const result = res.results[0];
    const companyId = result.company?.id ?? "c1";
    await service.recordWhatsappImpressions(res.searchId, [
      {
        companyId,
        position: result.position,
        isPaid: result.isPaid,
        chargedAmount: result.chargedAmount,
        clickTrackingId: result.clickTrackingId,
      },
    ]);

    expect(billing.reserveCalls).toHaveLength(1);
  });

  it("does not charge organic impressions", async () => {
    const repo = new FakeSearchRepository();
    const billing = new FakeBillingService({ c1: 0 });
    const auction = new FakeAuctionService({
      paid: { 1: [], 2: [], 3: [] },
      organicPool: [{ id: "c1", tradeName: "Org 1" } as any],
    });

    const service = new SearchService(repo as any, auction as any, billing as any, auditStub, contactStub);
    const res = await service.search({
      cityId: "city-1",
      nicheId: "niche-1",
      source: "whatsapp",
    } as any);

    expect(res.results.filter((r) => r.isPaid)).toHaveLength(0);
    expect(billing.reserveCalls).toHaveLength(0);
  });

  it("rebaixas paid result when charge fails on impression", async () => {
    const repo = new FakeSearchRepository();
    const billing = new FakeBillingService({ c1: 1000 });
    billing.failCompanies.add("c1");
    const auction = new FakeAuctionService({
      paid: {
        1: [{ companyId: "c1", bids: { 1: 200, 2: undefined, 3: undefined }, company: {} as any }],
        2: [],
        3: [],
      },
      organicPool: [],
    });

    const service = new SearchService(repo as any, auction as any, billing as any, auditStub, contactStub);
    const res = await service.search({
      cityId: "city-1",
      nicheId: "niche-1",
      source: "whatsapp",
    } as any);

    expect(res.results.filter((r) => r.isPaid)).toHaveLength(0);
    expect(billing.reserveCalls).toHaveLength(1);
  });
});
