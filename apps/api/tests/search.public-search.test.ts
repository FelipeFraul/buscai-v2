import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SearchRepository } from "../src/modules/search/search.repository";

const setEnv = () => {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "secret-secret-secret-123";
  process.env.REFRESH_SECRET = "refresh-secret-456789";
  process.env.WHATSAPP_PROVIDER = "zapi";
  process.env.CLAIM_SUPPORT_WHATSAPP = "5511999999999";
  process.env.SERPAPI_API_KEY = "serpapi-test-key";
  process.env.SERPAPI_ENCRYPTION_KEY = "serpapi-encryption-key";
};

describe("SearchService publicSearch niche matching", () => {
  beforeEach(() => {
    setEnv();
    vi.resetModules();
  });

  it("matches niche by tokens for short queries", async () => {
    const { SearchService } = await import("../src/modules/search/search.service");

    const searchRepository = {
      findCityByName: vi.fn().mockResolvedValue({ id: "city-1", name: "Itapetininga" }),
      listNiches: vi.fn().mockResolvedValue([
        { id: "niche-1", label: "Desenvolvedor Vibe Coding", slug: "desenvolvedor-vibe-coding" },
      ]),
      findNicheByLabelOrSlug: vi.fn().mockResolvedValue(null),
      findNicheById: vi
        .fn()
        .mockResolvedValue({ id: "niche-1", label: "Desenvolvedor Vibe Coding", slug: "dev" }),
      searchCompaniesByDirectQuery: vi.fn().mockResolvedValue([]),
      countActiveCompaniesByCityNiche: vi.fn().mockResolvedValue(1),
    } as unknown as SearchRepository;

    const service = new SearchService(
      searchRepository,
      {
        listConfigs: vi.fn().mockResolvedValue([]),
        getSearchRanking: vi.fn().mockResolvedValue({
          paid: { 1: [], 2: [], 3: [] },
          organicPool: [],
        }),
      } as never,
      {} as never,
      { logEvent: vi.fn() } as never,
      {} as never,
      undefined,
      {
        createNiche: vi.fn(),
        startImport: vi.fn(),
      } as never
    );

    const searchMock = vi
      .spyOn(service, "search")
      .mockResolvedValue({ searchId: "search-1", results: [] } as never);

    await service.publicSearch({
      text: "Vibe coding",
      city: "Itapetininga",
      limit: 5,
    });

    expect(searchMock).toHaveBeenCalledWith({
      cityId: "city-1",
      nicheId: "niche-1",
      query: "Vibe coding",
      source: "web",
    });
  });

  it("matches niche even when stopwords are present", async () => {
    const { SearchService } = await import("../src/modules/search/search.service");

    const searchRepository = {
      findCityByName: vi.fn().mockResolvedValue({ id: "city-1", name: "Itapetininga" }),
      listNiches: vi.fn().mockResolvedValue([
        { id: "niche-1", label: "Desenvolvedor Vibe Coding", slug: "desenvolvedor-vibe-coding" },
      ]),
      findNicheByLabelOrSlug: vi.fn().mockResolvedValue(null),
      findNicheById: vi
        .fn()
        .mockResolvedValue({ id: "niche-1", label: "Desenvolvedor Vibe Coding", slug: "dev" }),
      searchCompaniesByDirectQuery: vi.fn().mockResolvedValue([]),
      countActiveCompaniesByCityNiche: vi.fn().mockResolvedValue(1),
    } as unknown as SearchRepository;

    const service = new SearchService(
      searchRepository,
      {
        listConfigs: vi.fn().mockResolvedValue([]),
        getSearchRanking: vi.fn().mockResolvedValue({
          paid: { 1: [], 2: [], 3: [] },
          organicPool: [],
        }),
      } as never,
      {} as never,
      { logEvent: vi.fn() } as never,
      {} as never,
      undefined,
      {
        createNiche: vi.fn(),
        startImport: vi.fn(),
      } as never
    );

    const searchMock = vi
      .spyOn(service, "search")
      .mockResolvedValue({ searchId: "search-1", results: [] } as never);

    await service.publicSearch({
      text: "Vibe coding em Itapetininga",
      city: "Itapetininga",
      limit: 5,
    });

    expect(searchMock).toHaveBeenCalledWith({
      cityId: "city-1",
      nicheId: "niche-1",
      query: "Vibe coding em Itapetininga",
      source: "web",
    });
  });

  it("injects paid results on top for publicSearch", async () => {
    const { SearchService } = await import("../src/modules/search/search.service");

    const searchRepository = {
      findCityByName: vi.fn().mockResolvedValue({ id: "city-1", name: "Itapetininga" }),
      findNicheByLabelOrSlug: vi
        .fn()
        .mockResolvedValue({ id: "niche-1", label: "Desenvolvedor Vibe Coding", slug: "dev" }),
      searchCompaniesByDirectQuery: vi.fn().mockResolvedValue([]),
      countActiveCompaniesByCityNiche: vi.fn().mockResolvedValue(1),
      findCompaniesByIds: vi.fn().mockResolvedValue([
        {
          company: { id: "paid-1", tradeName: "Pago 1" },
          city: null,
          niches: [],
        },
        {
          company: { id: "paid-2", tradeName: "Pago 2" },
          city: null,
          niches: [],
        },
        {
          company: { id: "paid-3", tradeName: "Pago 3" },
          city: null,
          niches: [],
        },
      ]),
    } as unknown as SearchRepository;

    const auctionService = {
      getSearchRanking: vi.fn().mockResolvedValue({
        paid: {
          1: [
            {
              companyId: "paid-1",
              bids: { 1: 100 },
              company: { id: "paid-1", tradeName: "Pago 1" },
            },
          ],
          2: [
            {
              companyId: "paid-2",
              bids: { 2: 90 },
              company: { id: "paid-2", tradeName: "Pago 2" },
            },
          ],
          3: [
            {
              companyId: "paid-3",
              bids: { 3: 80 },
              company: { id: "paid-3", tradeName: "Pago 3" },
            },
          ],
        },
        organicPool: [],
      }),
    };

    const service = new SearchService(
      searchRepository,
      auctionService as never,
      {} as never,
      { logEvent: vi.fn() } as never,
      {} as never,
      undefined,
      {
        createNiche: vi.fn(),
        startImport: vi.fn(),
      } as never
    );

    const searchMock = vi.spyOn(service, "search").mockResolvedValue({
      searchId: "search-1",
      results: [
        {
          company: { id: "org-1", tradeName: "Org 1" },
          rank: 1,
          position: 1,
          isPaid: false,
          chargedAmount: 0,
        },
      ],
    } as never);

    const response = await service.publicSearch({
      text: "Vibe coding",
      city: "Itapetininga",
      niche: "Desenvolvedor Vibe Coding",
      limit: 5,
    });

    expect(searchMock).toHaveBeenCalled();
    expect(response.results.slice(0, 3).every((result) => result.isPaid)).toBe(true);
    expect(response.results[0]?.company?.id).toBe("paid-1");
    expect(response.results[1]?.company?.id).toBe("paid-2");
    expect(response.results[2]?.company?.id).toBe("paid-3");
  });
});
