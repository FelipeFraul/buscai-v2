import { describe, expect, it } from "vitest";
import { AuctionConfigInputSchema } from "@buscai/shared-schema";

import { AuctionService } from "../src/modules/auction/auction.service";
import type { AuctionConfigWithCompany } from "../src/modules/auction/auction.repository";

type Config = AuctionConfigWithCompany["config"];
type Company = AuctionConfigWithCompany["company"];

const makeCompany = (id: string): Company =>
  ({
    id,
    ownerId: "owner-1",
    tradeName: `Company ${id}`,
    legalName: null,
    cityId: "city-1",
    address: null,
    phone: null,
    whatsapp: null,
    openingHours: null,
    status: "active",
    createdAt: new Date(),
  }) as Company;

const makeConfig = (partial: Partial<Config>): Config =>
  ({
    id: partial.id ?? `config-${Math.random()}`,
    companyId: partial.companyId ?? "company-1",
    cityId: partial.cityId ?? "city-1",
    nicheId: partial.nicheId ?? "niche-1",
    mode: partial.mode ?? "manual",
    bidPosition1: partial.bidPosition1 ?? null,
    bidPosition2: partial.bidPosition2 ?? null,
    bidPosition3: partial.bidPosition3 ?? null,
    targetShare: partial.targetShare ?? null,
    dailyBudget: partial.dailyBudget ?? null,
    pauseOnLimit: partial.pauseOnLimit ?? true,
    isActive: partial.isActive ?? true,
    targetPosition: partial.targetPosition ?? null,
    createdAt: partial.createdAt ?? new Date("2024-01-01T00:00:00Z"),
  }) as Config;

class FakeAuctionRepository {
  constructor(private readonly configs: AuctionConfigWithCompany[]) {}

  async findActiveConfigsForSearch(): Promise<AuctionConfigWithCompany[]> {
    return this.configs;
  }

  async findOrganicCompanies(): Promise<Company[]> {
    return [];
  }
}

describe("AuctionService auto mode", () => {
  it("auto wins when effective bid exceeds manual bid", async () => {
    const manualCompany = makeCompany("manual-1");
    const autoCompany = makeCompany("auto-1");

    const configs: AuctionConfigWithCompany[] = [
      {
        company: manualCompany,
        config: makeConfig({
          id: "config-manual",
          companyId: manualCompany.id,
          mode: "manual",
          bidPosition1: "300",
          bidPosition2: "4",
          bidPosition3: "3",
        }),
      },
      {
        company: autoCompany,
        config: makeConfig({
          id: "config-auto",
          companyId: autoCompany.id,
          mode: "auto",
          targetPosition: 1,
          dailyBudget: "1000",
        }),
      },
    ];

    const repo = new FakeAuctionRepository(configs);
    const service = new AuctionService(repo as any, {} as any, {} as any);

    const ranking = await service.getSearchRanking({
      cityId: "city-1",
      nicheId: "niche-1",
    });

    const expectedBid = 350;
    expect(ranking.paid[1][0].companyId).toBe(autoCompany.id);
    expect(ranking.paid[1][0].bids[1]).toBe(expectedBid);
  });

  it("uses floor bids when market is empty", async () => {
    const autoCompany = makeCompany("auto-floor");
    const configs: AuctionConfigWithCompany[] = [
      {
        company: autoCompany,
        config: makeConfig({
          id: "config-auto",
          companyId: autoCompany.id,
          mode: "auto",
          targetPosition: 1,
        }),
      },
    ];

    const repo = new FakeAuctionRepository(configs);
    const service = new AuctionService(repo as any, {} as any, {} as any);
    const ranking = await service.getSearchRanking({
      cityId: "city-1",
      nicheId: "niche-1",
    });

    const expectedBid = 350;
    expect(ranking.paid[1][0].bids[1]).toBe(expectedBid);
    expect(ranking.paid[1][0].autoBidMeta?.usingFloor).toBe(true);
    expect(ranking.paid[1][0].autoBidMeta?.thresholdCents).toBe(300);
  });

  it("breaks ties by config createdAt then companyId", async () => {
    const companyA = makeCompany("company-a");
    const companyB = makeCompany("company-b");
    const earlier = new Date("2024-01-01T00:00:00Z");
    const later = new Date("2024-01-02T00:00:00Z");
    const configs: AuctionConfigWithCompany[] = [
      {
        company: companyB,
        config: makeConfig({
          id: "config-b",
          companyId: companyB.id,
          mode: "manual",
          bidPosition1: "300",
          createdAt: earlier,
        }),
      },
      {
        company: companyA,
        config: makeConfig({
          id: "config-a",
          companyId: companyA.id,
          mode: "manual",
          bidPosition1: "300",
          createdAt: later,
        }),
      },
    ];

    const repo = new FakeAuctionRepository(configs);
    const service = new AuctionService(repo as any, {} as any, {} as any);
    const ranking = await service.getSearchRanking({
      cityId: "city-1",
      nicheId: "niche-1",
    });

    expect(ranking.paid[1][0].companyId).toBe(companyB.id);
  });

  it("keeps auto ties deterministic by createdAt then companyId", async () => {
    const autoA = makeCompany("auto-a");
    const autoB = makeCompany("auto-b");
    const earlier = new Date("2024-01-01T00:00:00Z");
    const later = new Date("2024-01-02T00:00:00Z");
    const configs: AuctionConfigWithCompany[] = [
      {
        company: autoA,
        config: makeConfig({
          id: "config-auto-a",
          companyId: autoA.id,
          mode: "auto",
          targetPosition: 1,
          createdAt: later,
        }),
      },
      {
        company: autoB,
        config: makeConfig({
          id: "config-auto-b",
          companyId: autoB.id,
          mode: "auto",
          targetPosition: 1,
          createdAt: earlier,
        }),
      },
    ];

    const repo = new FakeAuctionRepository(configs);
    const service = new AuctionService(repo as any, {} as any, {} as any);
    const ranking = await service.getSearchRanking({
      cityId: "city-1",
      nicheId: "niche-1",
    });

    expect(ranking.paid[1][0].companyId).toBe(autoB.id);
  });

  it("falls back to companyId when createdAt is missing in candidates", async () => {
    const companyA = makeCompany("company-a");
    const companyB = makeCompany("company-b");
    const configs: AuctionConfigWithCompany[] = [
      {
        company: companyB,
        config: {
          ...makeConfig({
            id: "config-b",
            companyId: companyB.id,
            mode: "manual",
            bidPosition1: "300",
          }),
          createdAt: undefined as unknown as Date,
        },
      },
      {
        company: companyA,
        config: makeConfig({
          id: "config-a",
          companyId: companyA.id,
          mode: "manual",
          bidPosition1: "300",
          createdAt: new Date("2024-01-01T00:00:00Z"),
        }),
      },
    ];

    const repo = new FakeAuctionRepository(configs);
    const service = new AuctionService(repo as any, {} as any, {} as any);
    const ranking = await service.getSearchRanking({
      cityId: "city-1",
      nicheId: "niche-1",
    });

    expect(ranking.paid[1][0].companyId).toBe(companyA.id);
  });

  it("rejects invalid targetPosition on input schema", () => {
    const result = AuctionConfigInputSchema.safeParse({
      companyId: "company-1",
      cityId: "city-1",
      nicheId: "niche-1",
      mode: "auto",
      targetPosition: 9,
    });

    expect(result.success).toBe(false);
  });
});
