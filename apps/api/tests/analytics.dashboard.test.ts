import { describe, expect, it, vi } from "vitest";

import { AnalyticsService } from "../src/modules/analytics/analytics.service";

type TimedEvent = { createdAt: Date; amount?: number };

class FakeAnalyticsRepository {
  constructor(private appearances: TimedEvent[] = [], private costs: TimedEvent[] = []) {}

  async countPaidAppearances(_companyId: string, range?: { from?: Date; to?: Date }) {
    return this.appearances.filter((item) => {
      const ts = item.createdAt.getTime();
      if (range?.from && ts < range.from.getTime()) return false;
      if (range?.to && ts > range.to.getTime()) return false;
      return true;
    }).length;
  }

  async getCosts(_companyId: string, range?: { from?: Date; to?: Date }) {
    return this.costs
      .filter((item) => {
        const ts = item.createdAt.getTime();
        if (range?.from && ts < range.from.getTime()) return false;
        if (range?.to && ts > range.to.getTime()) return false;
        return true;
      })
      .reduce((sum, item) => sum + (item.amount ?? 0), 0);
  }

  async getRealImpressions(_companyId: string) {
    return this.appearances.length;
  }

  async getRealClicks(_companyId: string) {
    return { total: 0, whatsapp: 0, calls: 0 };
  }

  async getTopCompaniesByClicks() {
    return [];
  }
}

class FakeContactRepository {
  constructor(private events: TimedEvent[] = []) {}

  async countByCompany(_companyId: string, range?: { from?: Date; to?: Date }) {
    return this.events.filter((item) => {
      const ts = item.createdAt.getTime();
      if (range?.from && ts < range.from.getTime()) return false;
      if (range?.to && ts > range.to.getTime()) return false;
      return true;
    }).length;
  }

  async groupByDayOfWeek(_companyId: string, range?: { from?: Date; to?: Date }) {
    const filtered = this.events.filter((item) => {
      const ts = item.createdAt.getTime();
      if (range?.from && ts < range.from.getTime()) return false;
      if (range?.to && ts > range.to.getTime()) return false;
      return true;
    });

    const buckets: Record<number, number> = {};
    for (const event of filtered) {
      const dow = event.createdAt.getDay();
      buckets[dow] = (buckets[dow] ?? 0) + 1;
    }

    return Object.entries(buckets).map(([dow, total]) => ({ dow: Number(dow), total: Number(total) }));
  }

  async groupByHour(_companyId: string, range?: { from?: Date; to?: Date }) {
    const filtered = this.events.filter((item) => {
      const ts = item.createdAt.getTime();
      if (range?.from && ts < range.from.getTime()) return false;
      if (range?.to && ts > range.to.getTime()) return false;
      return true;
    });

    const buckets: Record<number, number> = {};
    for (const event of filtered) {
      const hour = event.createdAt.getHours();
      buckets[hour] = (buckets[hour] ?? 0) + 1;
    }

    return Object.entries(buckets).map(([hour, total]) => ({ hour: Number(hour), total: Number(total) }));
  }

  async topNiche() {
    return null;
  }
}

class FakeAuctionService {
  constructor(private configs: any[] = []) {}
  async listConfigs() {
    return this.configs;
  }
  async getSearchRanking() {
    return { paid: { 1: [], 2: [], 3: [] }, organicPool: [] };
  }
}

class FakeCompaniesRepository {
  async findCompanyWithNiches(companyId: string) {
    if (companyId === "missing") return null;
    return {
      company: { id: companyId, cityId: "city-1", status: "active", tradeName: "X", createdAt: new Date() },
      city: { id: "city-1", name: "City", state: "ST" },
      niches: [{ id: "n1", label: "Niche", slug: "niche", isActive: true }],
    };
  }
}

class FakeSearchRepository {
  async findNicheById() {
    return { id: "n1", label: "Niche", slug: "niche" };
  }
}

describe("Analytics dashboard", () => {
  it("defaults to zeros when no data and company missing companyId throws", async () => {
    const repo = new FakeAnalyticsRepository();
    const contacts = new FakeContactRepository();
    const auction = new FakeAuctionService();
    const companies = new FakeCompaniesRepository();
    const searchRepo = new FakeSearchRepository();

    const service = new AnalyticsService(
      repo as any,
      contacts as any,
      auction as any,
      companies as any,
      searchRepo as any
    );

    await expect(service.getDashboard({ companyId: "missing" })).rejects.toBeDefined();

    const res = await service.getDashboard({ companyId: "c1" });
    expect(res.moment.contactsToday).toBe(0);
    expect(res.moment.costPerContactToday).toBe(0);
    expect(res.period.totalSpent).toBe(0);
  });

  it("applies ranges for today, yesterday, 7d and 30d", async () => {
    vi.useFakeTimers();
    const now = new Date("2024-01-10T12:00:00Z");
    vi.setSystemTime(now);
    const today = new Date(now);
    const threeDaysAgo = new Date(now);
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const twentyDaysAgo = new Date(now);
    twentyDaysAgo.setDate(twentyDaysAgo.getDate() - 20);

    const appearances = [
      { createdAt: today },
      { createdAt: today },
      { createdAt: threeDaysAgo },
      { createdAt: threeDaysAgo },
      { createdAt: threeDaysAgo },
      { createdAt: twentyDaysAgo },
      { createdAt: twentyDaysAgo },
      { createdAt: twentyDaysAgo },
      { createdAt: twentyDaysAgo },
      { createdAt: twentyDaysAgo },
    ];

    const costs = [
      { createdAt: today, amount: 100 },
      { createdAt: today, amount: 100 },
      { createdAt: threeDaysAgo, amount: 300 },
      { createdAt: twentyDaysAgo, amount: 500 },
    ];

    const contacts = [
      { createdAt: today },
      { createdAt: today },
      { createdAt: threeDaysAgo },
      { createdAt: threeDaysAgo },
      { createdAt: threeDaysAgo },
      { createdAt: twentyDaysAgo },
      { createdAt: twentyDaysAgo },
    ];

    const repo = new FakeAnalyticsRepository(appearances, costs);
    const contactRepo = new FakeContactRepository(contacts);
    const auction = new FakeAuctionService(); // empty configs: niches not relevant for this test
    const companies = new FakeCompaniesRepository();
    const searchRepo = new FakeSearchRepository();

    const service = new AnalyticsService(
      repo as any,
      contactRepo as any,
      auction as any,
      companies as any,
      searchRepo as any
    );

    // Hoje (from/to) deve trazer apenas 2 appearances, 2 contacts, custo 200
    const startToday = new Date(now);
    startToday.setHours(0, 0, 0, 0);
    const endToday = new Date(now);
    endToday.setHours(23, 59, 59, 999);
    const todayRes = await service.getDashboard({
      companyId: "c1",
      from: startToday.toISOString(),
      to: endToday.toISOString(),
    });
    expect(todayRes.period.impressions).toBe(2);
    expect(todayRes.period.contacts).toBe(2);
    expect(todayRes.period.totalSpent).toBe(200);

    // Ontem (sem dados) deve ser zero
    const startYesterday = new Date(now);
    startYesterday.setDate(startYesterday.getDate() - 1);
    startYesterday.setHours(0, 0, 0, 0);
    const endYesterday = new Date(startYesterday);
    endYesterday.setHours(23, 59, 59, 999);
    const yesterdayRes = await service.getDashboard({
      companyId: "c1",
      from: startYesterday.toISOString(),
      to: endYesterday.toISOString(),
    });
    expect(yesterdayRes.period.impressions).toBe(0);
    expect(yesterdayRes.period.contacts).toBe(0);
    expect(yesterdayRes.period.totalSpent).toBe(0);

    // 7 dias: inclui hoje e últimos 6 dias -> hoje (2) + três dias atrás (3) = 5
    const sevenRes = await service.getDashboard({ companyId: "c1", period: "7" });
    expect(sevenRes.period.impressions).toBe(5);
    expect(sevenRes.period.contacts).toBe(5);
    expect(sevenRes.period.totalSpent).toBe(500);

    // 30 dias: inclui todos (10 impressions, 7 contacts, custo 1000)
    const thirtyRes = await service.getDashboard({ companyId: "c1", period: "30" });
    expect(thirtyRes.period.impressions).toBe(10);
    expect(thirtyRes.period.contacts).toBe(7);
    expect(thirtyRes.period.totalSpent).toBe(1000);

    vi.useRealTimers();
  });
});
