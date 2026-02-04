import { describe, expect, it, vi } from "vitest";

vi.mock("../src/core/database/client", () => {
  return {
    db: {
      async transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
        return fn({});
      },
    },
  };
});

import { SearchService } from "../src/modules/search/search.service";
import type { AuctionRanking } from "../src/modules/auction/auction.service";
import type { SearchRepository } from "../src/modules/search/search.repository";
import type { InternalAuditService } from "../src/modules/internal-audit/internal-audit.service";
import type { BillingService } from "../src/modules/billing/billing.service";
import type { AuctionService } from "../src/modules/auction/auction.service";

class FakeSearchRepository implements Partial<SearchRepository> {
  public insertedSearches: unknown[] = [];
  public insertedResults: unknown[] = [];

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
          id: "c1",
          ownerId: "owner-1",
          tradeName: "Dentista Itapetininga",
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
        niches: [
          { id: "niche-1", label: "Dentista", slug: "dentista", isActive: true },
        ],
      },
    ] as any;
  }

  async insertSearch(_client: unknown, payload: any) {
    this.insertedSearches.push(payload);
    return payload;
  }

  async insertResults(_client: unknown, results: any[]) {
    this.insertedResults.push(...results);
  }

  async saveSearchWithResults(params: { search: any; results: any[] }) {
    await this.insertSearch({}, params.search);
    await this.insertResults({}, params.results);
  }
}

class FakeAuctionService implements Partial<AuctionService> {
  async getSearchRanking(): Promise<AuctionRanking> {
    return {
      paid: { 1: [], 2: [], 3: [] },
      organicPool: [
        {
          id: "c1",
          ownerId: "owner-1",
          tradeName: "Dentista Itapetininga",
          legalName: null,
          cityId: "city-1",
          address: null,
          phone: null,
          whatsapp: null,
          openingHours: null,
          status: "active",
          createdAt: new Date(),
        } as any,
      ],
    };
  }
}

class FakeBillingService implements Partial<BillingService> {
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

describe("SearchService integration-like behavior", () => {
  it("logs search intent metadata and returns results", async () => {
    const repo = new FakeSearchRepository() as SearchRepository;
    const auction = new FakeAuctionService() as AuctionService;
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

    expect(response.results).toHaveLength(1);
    expect(audit.logEvent).toHaveBeenCalled();
    const payload = (audit.logEvent as any).mock.calls[0][0].payload;
    expect(payload.flags.nearMe).toBe(true);
  });

  it("returns offeredBy when legalName differs from tradeName", async () => {
    const repo = new FakeSearchRepository() as SearchRepository;
    (repo as any).findCompaniesByIds = async () => [
      {
        company: {
          id: "c1",
          ownerId: "owner-1",
          tradeName: "Clinica Exemplo",
          legalName: "Clinica Exemplo LTDA",
          cityId: "city-1",
          address: null,
          phone: null,
          whatsapp: null,
          openingHours: null,
          status: "active",
          createdAt: new Date(),
        },
        city: { id: "city-1", name: "Itapetininga", state: "SP" },
        niches: [
          { id: "niche-1", label: "Dentista", slug: "dentista", isActive: true },
        ],
      },
    ];
    const auction = new FakeAuctionService() as AuctionService;
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

    expect(response.offeredBy?.text).toBe("Clinica Exemplo LTDA");
  });

  it("returns offeredBy undefined when legalName is missing", async () => {
    const repo = new FakeSearchRepository() as SearchRepository;
    const auction = new FakeAuctionService() as AuctionService;
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

    expect(response.offeredBy).toBeUndefined();
  });

  it("orders organic results by qualityScore desc, name asc, id asc", async () => {
    const repo = new FakeSearchRepository() as SearchRepository;
    (repo as any).findCompaniesByIds = async () => [
      {
        company: {
          id: "b-id",
          ownerId: "owner-1",
          tradeName: "Beta Clinica",
          legalName: null,
          cityId: "city-1",
          address: null,
          phone: null,
          whatsapp: null,
          openingHours: null,
          status: "active",
          qualityScore: 80,
          createdAt: new Date(),
        },
        city: { id: "city-1", name: "Itapetininga", state: "SP" },
        niches: [{ id: "niche-1", label: "Dentista", slug: "dentista", isActive: true }],
      },
      {
        company: {
          id: "a-id",
          ownerId: "owner-1",
          tradeName: "Alpha Clinica",
          legalName: null,
          cityId: "city-1",
          address: null,
          phone: null,
          whatsapp: null,
          openingHours: null,
          status: "active",
          qualityScore: 80,
          createdAt: new Date(),
        },
        city: { id: "city-1", name: "Itapetininga", state: "SP" },
        niches: [{ id: "niche-1", label: "Dentista", slug: "dentista", isActive: true }],
      },
      {
        company: {
          id: "c-id",
          ownerId: "owner-1",
          tradeName: "Zeta Clinica",
          legalName: null,
          cityId: "city-1",
          address: null,
          phone: null,
          whatsapp: null,
          openingHours: null,
          status: "active",
          qualityScore: 90,
          createdAt: new Date(),
        },
        city: { id: "city-1", name: "Itapetininga", state: "SP" },
        niches: [{ id: "niche-1", label: "Dentista", slug: "dentista", isActive: true }],
      },
    ];

    const auction = {
      async getSearchRanking(): Promise<AuctionRanking> {
        return {
          paid: { 1: [], 2: [], 3: [] },
          organicPool: [
            {
              id: "b-id",
              tradeName: "Beta Clinica",
              cityId: "city-1",
              status: "active",
              qualityScore: 80,
            } as any,
            {
              id: "a-id",
              tradeName: "Alpha Clinica",
              cityId: "city-1",
              status: "active",
              qualityScore: 80,
            } as any,
            {
              id: "c-id",
              tradeName: "Zeta Clinica",
              cityId: "city-1",
              status: "active",
              qualityScore: 90,
            } as any,
          ],
        };
      },
    } as AuctionService;
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

    const orderedIds = response.results.map((item) => item.company?.id).filter(Boolean);
    expect(orderedIds[0]).toBe("c-id");
    expect(orderedIds[1]).toBe("a-id");
  });
});
