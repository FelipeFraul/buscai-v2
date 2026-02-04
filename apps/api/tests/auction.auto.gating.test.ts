import { describe, expect, it, vi } from "vitest";

import type { AuctionRanking } from "../src/modules/auction/auction.service";
import { SearchService } from "../src/modules/search/search.service";
import type { SearchRepository } from "../src/modules/search/search.repository";
import type { BillingService } from "../src/modules/billing/billing.service";
import type { InternalAuditService } from "../src/modules/internal-audit/internal-audit.service";
import type { AuctionService } from "../src/modules/auction/auction.service";

class FakeSearchRepository implements Partial<SearchRepository> {
  async listCities() {
    return [{ id: "city-1", name: "Itapetininga", state: "SP" }] as any;
  }

  async findCityById() {
    return { id: "city-1", name: "Itapetininga", state: "SP" } as any;
  }

  async findNicheById() {
    return { id: "niche-1", label: "Dentista", slug: "dentista", isActive: true } as any;
  }

  async findCompaniesByIds() {
    return [
      {
        company: {
          id: "auto-1",
          ownerId: "owner-1",
          tradeName: "Auto Co",
          legalName: null,
          cityId: "city-1",
          address: null,
          phone: null,
          whatsapp: null,
          openingHours: null,
          status: "active",
          createdAt: new Date(),
        },
        city: { id: "city-1", name: "Itapetininga", state: "SP" },
        niches: [{ id: "niche-1", label: "Dentista", slug: "dentista", isActive: true }],
      },
      {
        company: {
          id: "manual-1",
          ownerId: "owner-2",
          tradeName: "Manual Co",
          legalName: null,
          cityId: "city-1",
          address: null,
          phone: null,
          whatsapp: null,
          openingHours: null,
          status: "active",
          createdAt: new Date(),
        },
        city: { id: "city-1", name: "Itapetininga", state: "SP" },
        niches: [{ id: "niche-1", label: "Dentista", slug: "dentista", isActive: true }],
      },
    ] as any;
  }

  async saveSearchWithResults() {
    return;
  }

  async getPaidSpendByCompanyAndConfig() {
    return 10;
  }
}

class FakeAuctionService implements Partial<AuctionService> {
  constructor(private readonly ranking: AuctionRanking) {}

  async getSearchRanking(): Promise<AuctionRanking> {
    return this.ranking;
  }
}

class FakeBillingService implements Partial<BillingService> {
  async canCoverSearchCharge() {
    return true;
  }

  async canCoverSearchChargeWithDebug() {
    return {
      ok: true,
      balance: 0,
      reserved: 0,
      available: 0,
      walletExists: true,
      reason: "ok",
    };
  }
}

describe("SearchService paid slot gating", () => {
  it("skips auto when daily budget is reached and pause_on_limit is true", async () => {
    const repo = new FakeSearchRepository() as SearchRepository;
    const auction = new FakeAuctionService({
      paid: {
        1: [
          {
            companyId: "auto-1",
            configId: "config-auto",
            cityId: "city-1",
            nicheId: "niche-1",
            mode: "auto",
            targetPosition: 1,
            marketSnapshot: { 1: 300, 2: 200, 3: 150 },
            dailyBudget: 5,
            pauseOnLimit: true,
            isActive: true,
            bids: { 1: 350, 2: undefined, 3: undefined },
            company: { id: "auto-1" } as any,
          },
          {
            companyId: "manual-1",
            configId: "config-manual",
            cityId: "city-1",
            nicheId: "niche-1",
            mode: "manual",
            dailyBudget: null,
            pauseOnLimit: true,
            isActive: true,
            bids: { 1: 300, 2: undefined, 3: undefined },
            company: { id: "manual-1" } as any,
          },
        ],
        2: [],
        3: [],
      },
      organicPool: [],
    }) as AuctionService;
    const billing = new FakeBillingService() as BillingService;
    const audit = { logEvent: vi.fn(async () => {}) } as unknown as InternalAuditService;
    const contact = { recordContact: vi.fn(async () => {}) } as any;

    const service = new SearchService(repo, auction, billing, audit, contact);

    const response = await service.search({
      cityId: "city-1",
      nicheId: "niche-1",
      query: "Dentista perto de mim",
      source: "web",
    });

    expect(response.results[0].company?.id).toBe("manual-1");
    expect(response.results[0].isPaid).toBe(true);
  });

  it("does not pause when pause_on_limit is false", async () => {
    const repo = new FakeSearchRepository() as SearchRepository;
    const auction = new FakeAuctionService({
      paid: {
        1: [
          {
            companyId: "auto-1",
            configId: "config-auto",
            cityId: "city-1",
            nicheId: "niche-1",
            mode: "auto",
            targetPosition: 1,
            marketSnapshot: { 1: 300, 2: 200, 3: 150 },
            dailyBudget: 5,
            pauseOnLimit: false,
            isActive: true,
            bids: { 1: 350, 2: undefined, 3: undefined },
            company: { id: "auto-1" } as any,
          },
          {
            companyId: "manual-1",
            configId: "config-manual",
            cityId: "city-1",
            nicheId: "niche-1",
            mode: "manual",
            dailyBudget: null,
            pauseOnLimit: true,
            isActive: true,
            bids: { 1: 300, 2: undefined, 3: undefined },
            company: { id: "manual-1" } as any,
          },
        ],
        2: [],
        3: [],
      },
      organicPool: [],
    }) as AuctionService;
    const billing = new FakeBillingService() as BillingService;
    const audit = { logEvent: vi.fn(async () => {}) } as unknown as InternalAuditService;
    const contact = { recordContact: vi.fn(async () => {}) } as any;
    const service = new SearchService(repo, auction, billing, audit, contact);

    const response = await service.search({
      cityId: "city-1",
      nicheId: "niche-1",
      query: "Dentista perto de mim",
      source: "web",
    });

    expect(response.results[0].company?.id).toBe("auto-1");
    expect(response.results[0].isPaid).toBe(true);
  });

  it("does not pause when dailyBudget is null", async () => {
    const repo = new FakeSearchRepository() as SearchRepository;
    const auction = new FakeAuctionService({
      paid: {
        1: [
          {
            companyId: "auto-1",
            configId: "config-auto",
            cityId: "city-1",
            nicheId: "niche-1",
            mode: "auto",
            targetPosition: 1,
            marketSnapshot: { 1: 300, 2: 200, 3: 150 },
            dailyBudget: null,
            pauseOnLimit: true,
            isActive: true,
            bids: { 1: 350, 2: undefined, 3: undefined },
            company: { id: "auto-1" } as any,
          },
          {
            companyId: "manual-1",
            configId: "config-manual",
            cityId: "city-1",
            nicheId: "niche-1",
            mode: "manual",
            dailyBudget: null,
            pauseOnLimit: true,
            isActive: true,
            bids: { 1: 300, 2: undefined, 3: undefined },
            company: { id: "manual-1" } as any,
          },
        ],
        2: [],
        3: [],
      },
      organicPool: [],
    }) as AuctionService;
    const billing = new FakeBillingService() as BillingService;
    const audit = { logEvent: vi.fn(async () => {}) } as unknown as InternalAuditService;
    const contact = { recordContact: vi.fn(async () => {}) } as any;
    const service = new SearchService(repo, auction, billing, audit, contact);

    const response = await service.search({
      cityId: "city-1",
      nicheId: "niche-1",
      query: "Dentista perto de mim",
      source: "web",
    });

    expect(response.results[0].company?.id).toBe("auto-1");
    expect(response.results[0].isPaid).toBe(true);
  });
});
