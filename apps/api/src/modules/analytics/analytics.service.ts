import { AppError } from "../../core/errors";
import { AuctionService } from "../auction/auction.service";
import { CompaniesRepository } from "../companies/companies.repository";
import { ContactRepository } from "../contacts/contact.repository";
import { SearchRepository } from "../search/search.repository";
import { logger } from "../../core/logger";

import { AnalyticsRepository } from "./analytics.repository";

type DashboardPeriod = {
  impressions: number;
  contacts: number;
  totalSpent: number;
  realImpressions: number;
  realClicks: number;
  realClicksWhatsapp: number;
  realClicksCall: number;
  realCtr: number;
  topCompaniesByClick: Array<{ companyId: string; name: string; total: number }>;
  bestDayOfWeek: string | null;
  bestHour: string | null;
  topNiche: { nicheId: string; niche: string; total: number } | null;
};

type DashboardMoment = {
  appearancesToday: number;
  contactsToday: number;
  costPerContactToday: number;
  creditsSpentToday: number;
  currentPositionMainNiche: number | null;
};

type DashboardNiche = {
  nicheId: string;
  nicheName: string;
  positionToday: number | null;
  iecToday: number;
  impressionsToday: number;
  contactsToday: number;
  activeReserve: number;
};

export class AnalyticsService {
  constructor(
    private readonly repository: AnalyticsRepository,
    private readonly contactRepository: ContactRepository,
    private readonly auctionService: AuctionService,
    private readonly companiesRepository: CompaniesRepository,
    private readonly searchRepository: SearchRepository
  ) {}

  async getDashboard(params: {
    companyId: string;
    from?: string;
    to?: string;
    period?: string;
    isAdmin?: boolean;
    nicheId?: string;
    cityId?: string;
  }): Promise<{
    moment: DashboardMoment;
    period: DashboardPeriod;
    niches: DashboardNiche[];
    searches: {
      total: number;
      volumeByDay: Array<{ date: string; total: number }>;
      peakHours: Array<{ hour: number; total: number }>;
      byNiche: Array<{ niche: string; total: number }>;
      byProduct: Array<{ product: string; total: number }>;
    };
    appearances: {
      total: number;
      auction: { pos1: number; pos2: number; pos3: number };
      organic: { pos4: number; pos5: number };
      offered: number;
      byProduct: Array<{ product: string; total: number }>;
    };
    actions: {
      totalClicks: number;
      calls: number;
      whatsapp: number;
      ctr: number;
      clicksByHour: Array<{ hour: number; total: number }>;
    };
    costs: {
      totalSpent: number;
      costPerAppearance: number;
      costPerClick: number;
    };
    performance: {
      byNiche: Array<{ niche: string; value: number }>;
      byProduct: Array<{ product: string; value: number }>;
      byHour: Array<{ hour: number; value: number }>;
      byDay: Array<{ date: string; value: number }>;
    };
    origins: { calls: number; whatsapp: number; web: number };
  }> {
    const company = await this.companiesRepository.findCompanyWithNiches(params.companyId);
    if (!company) {
      throw new AppError(404, "company_not_found");
    }

    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const { from, to } = this.buildRange(params, now);
    logger.info("analytics.dashboard.request", {
      companyId: params.companyId,
      from: from.toISOString(),
      to: to.toISOString(),
      periodParam: params.period ?? "none",
      rawFrom: params.from ?? "none",
      rawTo: params.to ?? "none",
      nicheId: params.nicheId ?? null,
      cityId: params.cityId ?? null,
    });

    const [appearancesToday, contactsToday, creditsSpentToday] = await Promise.all([
      this.repository.countPaidAppearances(company.company.id, {
        from: startOfToday,
        to: now,
        nicheId: params.nicheId,
        cityId: params.cityId,
      }),
      this.contactRepository.countByCompany(company.company.id, {
        from: startOfToday,
        to: now,
        nicheId: params.nicheId,
      }),
      this.repository.getCosts(company.company.id, {
        from: startOfToday,
        to: now,
        nicheId: params.nicheId,
        cityId: params.cityId,
      }),
    ]);

    const moment: DashboardMoment = {
      appearancesToday,
      contactsToday,
      costPerContactToday: contactsToday > 0 ? creditsSpentToday / contactsToday : 0,
      creditsSpentToday,
      currentPositionMainNiche: await this.getCurrentPosition({
        companyId: company.company.id,
        cityId: params.cityId ?? company.company.cityId,
        nicheId: params.nicheId ?? company.niches[0]?.id,
      }),
    };

    const period = await this.buildPeriodSummary(
      company.company.id,
      { from, to, nicheId: params.nicheId, cityId: params.cityId },
      params.isAdmin ?? false
    );
    const niches = await this.buildNicheSummary(
      company.company.id,
      company.company.cityId,
      { from: startOfToday, to: now },
      params.nicheId
    );

    const legacy = await this.buildLegacyDashboard(company.company.id, { from, to }, {
      nicheId: params.nicheId,
      cityId: params.cityId,
    });

    logger.info("analytics.dashboard.result", {
      companyId: params.companyId,
      moment: {
        appearancesToday: moment.appearancesToday,
        contactsToday: moment.contactsToday,
        creditsSpentToday: moment.creditsSpentToday,
        currentPositionMainNiche: moment.currentPositionMainNiche,
      },
      period: {
        impressions: period.impressions,
        contacts: period.contacts,
        totalSpent: period.totalSpent,
        bestDayOfWeek: period.bestDayOfWeek,
        bestHour: period.bestHour,
      },
      nichesCount: niches.length,
      appearancesTotal: legacy.appearances.total,
      clicksTotal: legacy.actions.totalClicks,
    });

    return { moment, period, niches, ...legacy };
  }

  private buildRange(
    params: { from?: string; to?: string; period?: string },
    now: Date
  ): { from: Date; to: Date } {
    const rawTo = params.to ? new Date(params.to) : now;
    const to = new Date(rawTo);
    to.setHours(23, 59, 59, 999);

    // Convenção: período N inclui hoje e os N-1 dias anteriores, truncados para início/fim do dia.
    const days = this.parsePeriod(params.period ?? "7");

    let from: Date;
    if (params.from && !params.period) {
      from = new Date(params.from);
    } else {
      const startRef = new Date(to);
      startRef.setDate(startRef.getDate() - (days - 1));
      from = startRef;
    }

    const start = new Date(from);
    start.setHours(0, 0, 0, 0);

    return { from: start, to };
  }

  private parsePeriod(period: string): number {
    const match = period.match(/(\d+)/);
    const days = match ? Number(match[1]) : 7;
    const safe = Number.isFinite(days) && days > 0 ? days : 7;
    return Math.max(1, safe);
  }

  private shiftDays(reference: Date, days: number): Date {
    const copy = new Date(reference);
    copy.setDate(copy.getDate() - days);
    return copy;
  }

  private async buildPeriodSummary(
    companyId: string,
    range: { from: Date; to: Date; nicheId?: string; cityId?: string },
    includeTopCompanies: boolean
  ): Promise<DashboardPeriod> {
    const [impressions, contacts, totalSpent, dayBuckets, hourBuckets, topNiche] =
      await Promise.all([
        this.repository.countPaidAppearances(companyId, range),
        this.contactRepository.countByCompany(companyId, {
          from: range.from,
          to: range.to,
          nicheId: range.nicheId,
        }),
        this.repository.getCosts(companyId, range),
        this.contactRepository.groupByDayOfWeek(companyId, {
          from: range.from,
          to: range.to,
          nicheId: range.nicheId,
        }),
        this.contactRepository.groupByHour(companyId, {
          from: range.from,
          to: range.to,
          nicheId: range.nicheId,
        }),
        this.contactRepository.topNiche(companyId, {
          from: range.from,
          to: range.to,
          nicheId: range.nicheId,
        }),
      ]);

    const bestDay = dayBuckets.sort((a, b) => b.total - a.total)[0];
    const bestHour = hourBuckets.sort((a, b) => b.total - a.total)[0];

    const [realImpressions, realClicks, topCompaniesByClick] = await Promise.all([
      this.repository.getRealImpressions(companyId, range),
      this.repository.getRealClicks(companyId, range),
      includeTopCompanies ? this.repository.getTopCompaniesByClicks(range) : Promise.resolve([]),
    ]);

    const realCtr =
      realImpressions > 0 ? realClicks.total / realImpressions : 0;

    return {
      impressions,
      contacts,
      totalSpent,
      realImpressions,
      realClicks: realClicks.total,
      realClicksWhatsapp: realClicks.whatsapp,
      realClicksCall: realClicks.calls,
      realCtr,
      topCompaniesByClick,
      bestDayOfWeek: bestDay ? this.dayName(bestDay.dow) : null,
      bestHour: bestHour ? `${String(bestHour.hour).padStart(2, "0")}h` : null,
      topNiche,
    };
  }

  private async buildNicheSummary(
    companyId: string,
    cityId: string | null,
    todayRange: { from: Date; to: Date },
    nicheId?: string
  ): Promise<DashboardNiche[]> {
    const configs = await this.auctionService.listConfigs({ companyId });
    const activeConfigs = configs.filter((config) => {
      if (config.isActive === false) return false;
      if (nicheId && config.nicheId !== nicheId) return false;
      return true;
    });
    const result: DashboardNiche[] = [];

    for (const config of activeConfigs) {
      const niche = config.nicheId
        ? await this.searchRepository.findNicheById(config.nicheId)
        : null;

      const [impressionsToday, contactsToday, positionToday] = await Promise.all([
        this.repository.countPaidAppearances(companyId, {
          ...todayRange,
          nicheId: config.nicheId,
        }),
        this.contactRepository.countByCompany(companyId, {
          ...todayRange,
          nicheId: config.nicheId,
        }),
        this.getCurrentPosition({
          companyId,
          cityId: config.cityId ?? cityId ?? undefined,
          nicheId: config.nicheId,
        }),
      ]);

      result.push({
        nicheId: config.nicheId,
        nicheName: niche?.label ?? "Nicho",
        positionToday,
        iecToday: impressionsToday > 0 ? contactsToday / impressionsToday : 0,
        impressionsToday,
        contactsToday,
        activeReserve: (config.dailyBudget ?? 0) / 100,
      });
    }

    return result;
  }

  private async getCurrentPosition(input: {
    companyId: string;
    cityId?: string | null;
    nicheId?: string | null;
  }): Promise<number | null> {
    if (!input.cityId || !input.nicheId) {
      return null;
    }

    const ranking = await this.auctionService.getSearchRanking({
      cityId: input.cityId,
      nicheId: input.nicheId,
    });

    for (const position of [1, 2, 3] as const) {
      const candidate = ranking.paid[position]?.find(
        (item) => item.companyId === input.companyId
      );
      if (candidate) {
        return position;
      }
    }

    const organicIndex = ranking.organicPool.findIndex(
      (company) => company.id === input.companyId
    );

    if (organicIndex >= 0 && organicIndex < 2) {
      return 4 + organicIndex;
    }

    return null;
  }

  private dayName(dow: number): string {
    const days = [
      "Domingo",
      "Segunda",
      "Terça",
      "Quarta",
      "Quinta",
      "Sexta",
      "Sábado",
    ];
    return days[dow] ?? "N/A";
  }

  private async buildLegacyDashboard(
    companyId: string,
    range: { from: Date; to: Date },
    filters: { nicheId?: string; cityId?: string }
  ) {
    const scopedRange = { ...range, ...filters };

    const [
      searchesTotal,
      searchesByDay,
      searchesPeakHours,
      searchesByNiche,
      searchesByProduct,
      appearancesTotal,
      appearancesAuction,
      appearancesOrganic,
      appearancesOffered,
      appearancesByProduct,
      clicks,
      clicksByHour,
      totalSpent,
      performanceByNiche,
      performanceByProduct,
      performanceByHour,
      performanceByDay,
      origins,
    ] = await Promise.all([
      this.repository.getTotalSearches(companyId, scopedRange),
      this.repository.getSearchVolumeByDay(companyId, scopedRange),
      this.repository.getPeakHours(companyId, scopedRange),
      this.repository.getSearchesByNiche(companyId, scopedRange),
      this.repository.getSearchesByProduct(companyId, scopedRange),
      this.repository.getAppearances(companyId, scopedRange),
      this.repository.getAppearancesAuction(companyId, scopedRange),
      this.repository.getAppearancesOrganic(companyId, scopedRange),
      this.repository.getAppearancesOffered(companyId, scopedRange),
      this.repository.getAppearancesByProduct(companyId, scopedRange),
      this.repository.getClicks(companyId, scopedRange),
      this.repository.getClicksByHour(companyId, scopedRange),
      this.repository.getCosts(companyId, scopedRange),
      this.repository.getPerformanceByNiche(companyId, scopedRange),
      this.repository.getPerformanceByProduct(companyId, scopedRange),
      this.repository.getPerformanceByHour(companyId, scopedRange),
      this.repository.getPerformanceByDay(companyId, scopedRange),
      this.repository.getOrigins(companyId, scopedRange),
    ]);

    const totalClicks = clicks.totalClicks ?? 0;
    const costPerAppearance = appearancesTotal > 0 ? totalSpent / appearancesTotal : 0;
    const costPerClick = totalClicks > 0 ? totalSpent / totalClicks : 0;
    const ctr = appearancesTotal > 0 ? totalClicks / appearancesTotal : 0;

    return {
      searches: {
        total: searchesTotal,
        volumeByDay: searchesByDay,
        peakHours: searchesPeakHours,
        byNiche: searchesByNiche.map((item) => ({
          niche: item.niche,
          total: item.total,
        })),
        byProduct: searchesByProduct.map((item) => ({
          product: item.product,
          total: item.total,
        })),
      },
      appearances: {
        total: appearancesTotal,
        auction: appearancesAuction,
        organic: appearancesOrganic,
        offered: appearancesOffered,
        byProduct: appearancesByProduct.map((item) => ({
          product: item.product,
          total: item.total,
        })),
      },
      actions: {
        totalClicks,
        calls: clicks.calls,
        whatsapp: clicks.whatsapp,
        ctr,
        clicksByHour,
      },
      costs: {
        totalSpent,
        costPerAppearance,
        costPerClick,
      },
      performance: {
        byNiche: performanceByNiche.map((item) => ({
          niche: item.niche,
          value: item.clicks,
        })),
        byProduct: performanceByProduct.map((item) => ({
          product: item.product,
          value: item.clicks,
        })),
        byHour: performanceByHour.map((item) => ({
          hour: item.hour,
          value: item.clicks,
        })),
        byDay: performanceByDay.map((item) => ({
          date: item.date,
          value: item.clicks,
        })),
      },
      origins,
    };
  }
}
