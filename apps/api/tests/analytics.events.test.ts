import { beforeAll, describe, expect, it } from "vitest";
import { and, eq, gte, lte } from "drizzle-orm";

import { db } from "../src/core/database/client";
import { users } from "../src/modules/auth/auth.schema";
import { cities, niches } from "../src/modules/catalog/catalog.schema";
import { companies } from "../src/modules/companies/companies.schema";
import { searchEvents, searchResults, searches } from "../src/modules/search/search.schema";
import { AnalyticsRepository } from "../src/modules/analytics/analytics.repository";
import { AnalyticsService } from "../src/modules/analytics/analytics.service";

class FakeContactRepository {
  async countByCompany() {
    return 0;
  }
  async groupByDayOfWeek() {
    return [];
  }
  async groupByHour() {
    return [];
  }
  async topNiche() {
    return null;
  }
}

class FakeAuctionService {
  async listConfigs() {
    return [];
  }
  async getSearchRanking() {
    return { paid: { 1: [], 2: [], 3: [] }, organicPool: [] };
  }
}

class FakeCompaniesRepository {
  constructor(private readonly companyId: string, private readonly cityId: string) {}
  async findCompanyWithNiches(companyId: string) {
    if (companyId !== this.companyId) return null;
    return {
      company: { id: this.companyId, cityId: this.cityId, status: "active", tradeName: "Empresa X" },
      city: { id: this.cityId, name: "Cidade", state: "SP" },
      niches: [],
    };
  }
}

class FakeSearchRepository {
  async findNicheById() {
    return null;
  }
}

describe("Analytics real metrics (search_events)", () => {
  let companyId: string;
  let companyIdB: string;
  let searchId: string;
  let searchIdB: string;
  let cityId: string;
  let createdAt: Date;

  beforeAll(async () => {
    const [city] = await db
      .insert(cities)
      .values({ name: `Cidade Analytics ${Date.now()}`, state: "SP", isActive: true })
      .returning({ id: cities.id });
    cityId = city.id;

    const [niche] = await db
      .insert(niches)
      .values({ label: `Nicho Analytics ${Date.now()}`, slug: `nicho-analytics-${Date.now()}`, isActive: true })
      .returning({ id: niches.id });

    const [user] = await db
      .insert(users)
      .values({
        name: "Owner Analytics",
        email: `owner-analytics-${Date.now()}@local`,
        passwordHash: "hash",
        role: "company_owner",
      })
      .returning({ id: users.id });

    const [company] = await db
      .insert(companies)
      .values({
        ownerId: user.id,
        tradeName: "Empresa Analytics",
        cityId,
        status: "active",
      })
      .returning({ id: companies.id });
    companyId = company.id;

    const [companyB] = await db
      .insert(companies)
      .values({
        ownerId: user.id,
        tradeName: "Empresa Analytics B",
        cityId,
        status: "active",
      })
      .returning({ id: companies.id });
    companyIdB = companyB.id;

    const [search] = await db
      .insert(searches)
      .values({
        queryText: "clinica",
        cityId,
        nicheId: niche.id,
        source: "web",
      })
      .returning({ id: searches.id });
    searchId = search.id;

    const [searchB] = await db
      .insert(searches)
      .values({
        queryText: "clinica b",
        cityId,
        nicheId: niche.id,
        source: "web",
      })
      .returning({ id: searches.id });
    searchIdB = searchB.id;

    createdAt = new Date("2099-02-01T12:00:00.000Z");
    const rangeStart = new Date(createdAt);
    rangeStart.setHours(0, 0, 0, 0);
    const rangeEnd = new Date(createdAt);
    rangeEnd.setHours(23, 59, 59, 999);

    await db
      .delete(searchEvents)
      .where(and(gte(searchEvents.createdAt, rangeStart), lte(searchEvents.createdAt, rangeEnd)));

    await db.insert(searchResults).values({
      searchId,
      companyId,
      isPaid: true,
      position: 1,
      rank: 1,
      chargedAmount: "10",
    });

    await db.insert(searchEvents).values({
      searchId,
      type: "impression",
      createdAt,
    });
    await db.insert(searchEvents).values({
      searchId,
      companyId,
      type: "click_whatsapp",
      createdAt,
    });
    await db.insert(searchEvents).values({
      searchId,
      companyId,
      type: "click_call",
      createdAt,
    });

    await db.insert(searchResults).values({
      searchId: searchIdB,
      companyId: companyIdB,
      isPaid: true,
      position: 2,
      rank: 2,
      chargedAmount: "10",
    });

    await db.insert(searchEvents).values({
      searchId: searchIdB,
      type: "impression",
      createdAt,
    });
    await db.insert(searchEvents).values({
      searchId: searchIdB,
      companyId: companyIdB,
      type: "click_whatsapp",
      createdAt,
    });

    try {
      await db.insert(searchEvents).values({
        searchId,
        type: "impression",
        createdAt,
      });
    } catch {
      // unique index should prevent duplicate impressions
    }
  });

  it("computes realImpressions/realClicks/CTR from search_events", async () => {
    const service = new AnalyticsService(
      new AnalyticsRepository(),
      new FakeContactRepository() as any,
      new FakeAuctionService() as any,
      new FakeCompaniesRepository(companyId, cityId) as any,
      new FakeSearchRepository() as any
    );

    const from = new Date(createdAt);
    from.setHours(0, 0, 0, 0);
    const to = new Date(createdAt);
    to.setHours(23, 59, 59, 999);
    const res = await service.getDashboard({
      companyId,
      isAdmin: false,
      from: from.toISOString(),
      to: to.toISOString(),
    });
    expect(res.period.realImpressions).toBe(1);
    expect(res.period.realClicks).toBe(2);
    expect(res.period.realClicksWhatsapp).toBe(1);
    expect(res.period.realClicksCall).toBe(1);
    expect(res.period.realCtr).toBe(2);
  });

  it("dedupes impressions by searchId", async () => {
    const repo = new AnalyticsRepository();
    const impressions = await repo.getRealImpressions(companyId);
    expect(impressions).toBe(1);
  });

  it("returns topCompaniesByClick only for admin", async () => {
    const service = new AnalyticsService(
      new AnalyticsRepository(),
      new FakeContactRepository() as any,
      new FakeAuctionService() as any,
      new FakeCompaniesRepository(companyId, cityId) as any,
      new FakeSearchRepository() as any
    );

    const userRes = await service.getDashboard({ companyId, isAdmin: false });
    expect(userRes.period.topCompaniesByClick).toEqual([]);

    const from = new Date(createdAt);
    from.setHours(0, 0, 0, 0);
    const to = new Date(createdAt);
    to.setHours(23, 59, 59, 999);
    const adminRes = await service.getDashboard({
      companyId,
      isAdmin: true,
      from: from.toISOString(),
      to: to.toISOString(),
    });
    expect(adminRes.period.topCompaniesByClick.length).toBeGreaterThan(0);
    expect(adminRes.period.topCompaniesByClick[0]?.companyId).toBe(companyId);

    const [row] = await db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);
    expect(row?.id).toBe(companyId);
  });
});
