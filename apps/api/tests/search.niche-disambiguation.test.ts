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

describe("SearchService niche disambiguation", () => {
  beforeEach(() => {
    setEnv();
    vi.resetModules();
  });

  it("does not create a new niche when related niches exist and returns disambiguation", async () => {
    const { SearchService } = await import("../src/modules/search/search.service");

    const searchRepository = {
      findCityByName: vi.fn().mockResolvedValue({ id: "city-1", name: "Itapetininga" }),
      listNiches: vi.fn().mockResolvedValue([
        { id: "n1", label: "Consultoria em Inteligencia Artificial", slug: "consultoria-ia" },
        { id: "n2", label: "Desenvolvedor de Inteligencia Artificial", slug: "dev-ia" },
        { id: "n3", label: "Instrutor de Inteligencia Artificial", slug: "instrutor-ia" },
        { id: "n4", label: "Professor de Inteligencia Artificial", slug: "professor-ia" },
      ]),
      findNicheByLabelOrSlug: vi.fn().mockResolvedValue(null),
      searchCompaniesByDirectQuery: vi.fn().mockResolvedValue([]),
      countActiveCompaniesByCityNiche: vi.fn().mockResolvedValue(5),
    } as unknown as SearchRepository;

    const serpapi = {
      createNiche: vi.fn(),
      startImport: vi.fn(),
    };

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
      serpapi as never
    );

    const response = (await service.publicSearch({
      text: "Inteligencia artificial",
      city: "Itapetininga",
      limit: 5,
    })) as any;

    expect(response.needsDisambiguation).toBe(true);
    expect(response.nicheOptions).toHaveLength(4);
    expect(serpapi.createNiche).not.toHaveBeenCalled();
    expect(serpapi.startImport).not.toHaveBeenCalled();
  });
});
