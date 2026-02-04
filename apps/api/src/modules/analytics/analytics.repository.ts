import { and, desc, eq, gte, lte, sql } from "drizzle-orm";

import { db, type DatabaseClient } from "../../core/database/client";
import { billingTransactions } from "../billing/billing.schema";
import { niches } from "../catalog/catalog.schema";
import { companies } from "../companies/companies.schema";
import { searchEvents, searchResults, searches } from "../search/search.schema";

type DbClient = DatabaseClient;

type CountRow = { value: number | string | null };

type SearchRange = {
  from?: Date;
  to?: Date;
  nicheId?: string;
  cityId?: string;
};

function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export class AnalyticsRepository {
  constructor(private readonly database: DbClient = db) {}

  private buildCompanyFilter(companyId: string) {
    return eq(searchResults.companyId, companyId);
  }

  private buildSearchFilters(companyId: string, range?: SearchRange) {
    const filters = [eq(searchResults.companyId, companyId)];

    if (range?.nicheId) {
      filters.push(eq(searches.nicheId, range.nicheId));
    }

    if (range?.cityId) {
      filters.push(eq(searches.cityId, range.cityId));
    }

    if (range?.from) {
      filters.push(gte(searches.createdAt, range.from));
    }

    if (range?.to) {
      filters.push(lte(searches.createdAt, range.to));
    }

    return filters;
  }

  private buildSearchEventFilters(companyId: string | null, range?: SearchRange) {
    const filters = [];

    if (companyId) {
      filters.push(eq(searchResults.companyId, companyId));
    }

    if (range?.nicheId) {
      filters.push(eq(searches.nicheId, range.nicheId));
    }

    if (range?.cityId) {
      filters.push(eq(searches.cityId, range.cityId));
    }

    if (range?.from) {
      filters.push(gte(searchEvents.createdAt, range.from));
    }

    if (range?.to) {
      filters.push(lte(searchEvents.createdAt, range.to));
    }

    return filters;
  }

  async getTotalSearches(companyId: string, range?: SearchRange): Promise<number> {
    const where = this.buildSearchFilters(companyId, range);

    const rows = await this.database
      .select({ value: sql<number>`count(distinct ${searches.id})` })
      .from(searches)
      .innerJoin(searchResults, eq(searchResults.searchId, searches.id))
      .where(and(...where));

    return toNumber(rows[0]?.value);
  }

  async getSearchesByNiche(companyId: string, range?: SearchRange): Promise<
    Array<{ nicheId: string; niche: string; total: number }>
  > {
    const where = this.buildSearchFilters(companyId, range);

    const rows = await this.database
      .select({
        nicheId: niches.id,
        niche: niches.label,
        total: sql<number>`count(distinct ${searches.id})`,
      })
      .from(searches)
      .innerJoin(searchResults, eq(searchResults.searchId, searches.id))
      .innerJoin(niches, eq(niches.id, searches.nicheId))
      .where(and(...where))
      .groupBy(niches.id, niches.label)
      .orderBy(desc(sql`count(distinct ${searches.id})`));

    return rows.map((row) => ({
      nicheId: row.nicheId,
      niche: row.niche ?? "",
      total: toNumber(row.total),
    }));
  }

  async getSearchesByProduct(companyId: string, range?: SearchRange): Promise<
    Array<{ productId: string; product: string; total: number }>
  > {
    const where = this.buildSearchFilters(companyId, range);

    const rows = await this.database
      .select({
        productId: companies.id,
        product: companies.tradeName,
        total: sql<number>`count(distinct ${searches.id})`,
      })
      .from(searchResults)
      .innerJoin(searches, eq(searches.id, searchResults.searchId))
      .innerJoin(companies, eq(companies.id, searchResults.companyId))
      .where(and(...where))
      .groupBy(companies.id, companies.tradeName)
      .orderBy(desc(sql`count(distinct ${searches.id})`));

    return rows.map((row) => ({
      productId: row.productId,
      product: row.product ?? "",
      total: toNumber(row.total),
    }));
  }

  async getSearchVolumeByDay(companyId: string, range?: SearchRange): Promise<
    Array<{ date: string; total: number }>
  > {
    const where = this.buildSearchFilters(companyId, range);
    const bucket = sql<string>`date_trunc('day', ${searches.createdAt})`;

    const rows = await this.database
      .select({
        bucket,
        total: sql<number>`count(distinct ${searches.id})`,
      })
      .from(searches)
      .innerJoin(searchResults, eq(searchResults.searchId, searches.id))
      .where(and(...where))
      .groupBy(bucket)
      .orderBy(bucket);

    return rows.map((row) => ({
      date: new Date(row.bucket).toISOString(),
      total: toNumber(row.total),
    }));
  }

  async getPeakHours(companyId: string, range?: SearchRange): Promise<Array<{ hour: number; total: number }>> {
    const where = this.buildSearchFilters(companyId, range);
    const hourExpr = sql<number>`extract(hour from ${searches.createdAt})`;

    const rows = await this.database
      .select({
        hour: hourExpr,
        total: sql<number>`count(distinct ${searches.id})`,
      })
      .from(searches)
      .innerJoin(searchResults, eq(searchResults.searchId, searches.id))
      .where(and(...where))
      .groupBy(hourExpr)
      .orderBy(hourExpr);

    return rows.map((row) => ({
      hour: toNumber(row.hour),
      total: toNumber(row.total),
    }));
  }

  async getAppearances(companyId: string, range?: SearchRange): Promise<number> {
    const where = this.buildSearchFilters(companyId, range);

    const rows = await this.database
      .select({ value: sql<number>`count(${searchResults.id})` })
      .from(searchResults)
      .innerJoin(searches, eq(searches.id, searchResults.searchId))
      .where(and(...where));

    return toNumber(rows[0]?.value);
  }

  async getAppearancesAuction(
    companyId: string,
    range?: SearchRange
  ): Promise<{ pos1: number; pos2: number; pos3: number }> {
    const where = this.buildSearchFilters(companyId, range);

    const rows = await this.database
      .select({
        pos1: sql<number>`sum(case when ${searchResults.position} = 1 then 1 else 0 end)`,
        pos2: sql<number>`sum(case when ${searchResults.position} = 2 then 1 else 0 end)`,
        pos3: sql<number>`sum(case when ${searchResults.position} = 3 then 1 else 0 end)`,
      })
      .from(searchResults)
      .innerJoin(searches, eq(searches.id, searchResults.searchId))
      .where(and(...where));

    const row = rows[0] ?? {};
    return {
      pos1: toNumber(row.pos1 as CountRow["value"]),
      pos2: toNumber(row.pos2 as CountRow["value"]),
      pos3: toNumber(row.pos3 as CountRow["value"]),
    };
  }

  async getAppearancesOrganic(
    companyId: string,
    range?: SearchRange
  ): Promise<{ pos4: number; pos5: number }> {
    const where = this.buildSearchFilters(companyId, range);

    const rows = await this.database
      .select({
        pos4: sql<number>`sum(case when ${searchResults.position} = 4 then 1 else 0 end)`,
        pos5: sql<number>`sum(case when ${searchResults.position} = 5 then 1 else 0 end)`,
      })
      .from(searchResults)
      .innerJoin(searches, eq(searches.id, searchResults.searchId))
      .where(and(...where));

    const row = rows[0] ?? {};
    return {
      pos4: toNumber(row.pos4 as CountRow["value"]),
      pos5: toNumber(row.pos5 as CountRow["value"]),
    };
  }

  async getAppearancesOffered(companyId: string, range?: SearchRange): Promise<number> {
    const where = this.buildSearchFilters(companyId, range);

    const rows = await this.database
      .select({
        value: sql<number>`sum(case when ${searchResults.isPaid} = true then 1 else 0 end)`,
      })
      .from(searchResults)
      .innerJoin(searches, eq(searches.id, searchResults.searchId))
      .where(and(...where));

    return toNumber(rows[0]?.value);
  }

  async getAppearancesByProduct(companyId: string, range?: SearchRange): Promise<
    Array<{ productId: string; product: string; total: number }>
  > {
    const where = this.buildSearchFilters(companyId, range);

    const rows = await this.database
      .select({
        productId: companies.id,
        product: companies.tradeName,
        total: sql<number>`count(${searchResults.id})`,
      })
      .from(searchResults)
      .innerJoin(companies, eq(companies.id, searchResults.companyId))
      .innerJoin(searches, eq(searches.id, searchResults.searchId))
      .where(and(...where))
      .groupBy(companies.id, companies.tradeName)
      .orderBy(desc(sql`count(${searchResults.id})`));

    return rows.map((row) => ({
      productId: row.productId,
      product: row.product ?? "",
      total: toNumber(row.total),
    }));
  }

  async getClicks(
    companyId: string,
    range?: SearchRange
  ): Promise<{ calls: number; whatsapp: number; totalClicks: number }> {
    const where = this.buildSearchFilters(companyId, range);

    const rows = await this.database
      .select({
        calls: sql<number>`sum(case when ${searchResults.clickTrackingId} ilike 'phone-%' then 1 else 0 end)`,
        whatsapp: sql<number>`sum(case when ${searchResults.clickTrackingId} ilike 'whatsapp-%' then 1 else 0 end)`,
        total: sql<number>`sum(case when ${searchResults.clickTrackingId} is not null then 1 else 0 end)`,
      })
      .from(searchResults)
      .innerJoin(searches, eq(searches.id, searchResults.searchId))
      .where(and(...where));

    const row = rows[0] ?? {};
    return {
      calls: toNumber(row.calls as CountRow["value"]),
      whatsapp: toNumber(row.whatsapp as CountRow["value"]),
      totalClicks: toNumber(row.total as CountRow["value"]),
    };
  }

  async getRealImpressions(
    companyId: string,
    range?: SearchRange
  ): Promise<number> {
    const where = [
      eq(searchEvents.type, "impression" as const),
      ...this.buildSearchEventFilters(companyId, range),
    ];

    const rows = await this.database
      .select({ value: sql<number>`count(distinct ${searchEvents.searchId})` })
      .from(searchEvents)
      .innerJoin(searchResults, eq(searchResults.searchId, searchEvents.searchId))
      .innerJoin(searches, eq(searches.id, searchEvents.searchId))
      .where(and(...where));

    return toNumber(rows[0]?.value);
  }

  async getRealClicks(
    companyId: string,
    range?: SearchRange
  ): Promise<{ total: number; whatsapp: number; calls: number }> {
    const where = [
      eq(searchEvents.companyId, companyId),
      sql`${searchEvents.type} in ('click_whatsapp','click_call')`,
    ];

    if (range?.from) {
      where.push(gte(searchEvents.createdAt, range.from));
    }

    if (range?.to) {
      where.push(lte(searchEvents.createdAt, range.to));
    }

    if (range?.nicheId) {
      where.push(eq(searches.nicheId, range.nicheId));
    }

    if (range?.cityId) {
      where.push(eq(searches.cityId, range.cityId));
    }

    const rows = await this.database
      .select({
        total: sql<number>`count(${searchEvents.id})`,
        whatsapp: sql<number>`sum(case when ${searchEvents.type} = 'click_whatsapp' then 1 else 0 end)`,
        calls: sql<number>`sum(case when ${searchEvents.type} = 'click_call' then 1 else 0 end)`,
      })
      .from(searchEvents)
      .innerJoin(searches, eq(searches.id, searchEvents.searchId))
      .where(and(...where));

    const row = rows[0] ?? {};
    return {
      total: toNumber(row.total as CountRow["value"]),
      whatsapp: toNumber(row.whatsapp as CountRow["value"]),
      calls: toNumber(row.calls as CountRow["value"]),
    };
  }

  async getTopCompaniesByClicks(
    range?: SearchRange,
    limit = 5
  ): Promise<Array<{ companyId: string; name: string; total: number }>> {
    const where = [sql`${searchEvents.type} in ('click_whatsapp','click_call')`];

    if (range?.from) {
      where.push(gte(searchEvents.createdAt, range.from));
    }

    if (range?.to) {
      where.push(lte(searchEvents.createdAt, range.to));
    }

    if (range?.nicheId) {
      where.push(eq(searches.nicheId, range.nicheId));
    }

    if (range?.cityId) {
      where.push(eq(searches.cityId, range.cityId));
    }

    const rows = await this.database
      .select({
        companyId: companies.id,
        name: companies.tradeName,
        total: sql<number>`count(${searchEvents.id})`,
      })
      .from(searchEvents)
      .innerJoin(searches, eq(searches.id, searchEvents.searchId))
      .innerJoin(companies, eq(companies.id, searchEvents.companyId))
      .where(and(...where))
      .groupBy(companies.id, companies.tradeName)
      .orderBy(desc(sql`count(${searchEvents.id})`))
      .limit(limit);

    return rows.map((row) => ({
      companyId: row.companyId,
      name: row.name ?? "",
      total: toNumber(row.total),
    }));
  }

  async getClicksByHour(
    companyId: string,
    range?: SearchRange
  ): Promise<Array<{ hour: number; total: number }>> {
    const baseFilter = this.buildSearchFilters(companyId, range);
    const where = and(...baseFilter, sql`${searchResults.clickTrackingId} is not null`);
    const hourExpr = sql<number>`extract(hour from ${searches.createdAt})`;

    const rows = await this.database
      .select({
        hour: hourExpr,
        total: sql<number>`count(${searchResults.id})`,
      })
      .from(searchResults)
      .innerJoin(searches, eq(searches.id, searchResults.searchId))
      .where(where)
      .groupBy(hourExpr)
      .orderBy(hourExpr);

    return rows.map((row) => ({
      hour: toNumber(row.hour),
      total: toNumber(row.total),
    }));
  }

  async getCosts(companyId: string, range?: SearchRange): Promise<number> {
    if (range?.nicheId || range?.cityId) {
      const where = this.buildSearchFilters(companyId, range);
      const rows = await this.database
        .select({
          value: sql<number>`coalesce(sum(${searchResults.chargedAmount}), 0)`,
        })
        .from(searchResults)
        .innerJoin(searches, eq(searches.id, searchResults.searchId))
        .where(and(...where));

      return toNumber(rows[0]?.value);
    }

    const where = [
      eq(billingTransactions.type, "search_debit" as const),
      eq(billingTransactions.companyId, companyId),
    ];

    if (range?.from) {
      where.push(gte(billingTransactions.occurredAt, range.from));
    }

    if (range?.to) {
      where.push(lte(billingTransactions.occurredAt, range.to));
    }

    const rows = await this.database
      .select({
        value: sql<number>`coalesce(sum(${billingTransactions.amount}), 0)`,
      })
      .from(billingTransactions)
      .where(and(...where));

    return toNumber(rows[0]?.value);
  }

  async countPaidAppearances(companyId: string, range?: SearchRange): Promise<number> {
    const where = [
      eq(searchResults.companyId, companyId),
      eq(searchResults.isPaid, true),
      lte(searchResults.position, 3),
    ];

    if (range?.from) {
      where.push(gte(searches.createdAt, range.from));
    }

    if (range?.to) {
      where.push(lte(searches.createdAt, range.to));
    }

    if (range?.nicheId) {
      where.push(eq(searches.nicheId, range.nicheId));
    }

    if (range?.cityId) {
      where.push(eq(searches.cityId, range.cityId));
    }

    const rows = await this.database
      .select({ value: sql<number>`count(${searchResults.id})` })
      .from(searchResults)
      .innerJoin(searches, eq(searches.id, searchResults.searchId))
      .where(and(...where));

    return toNumber(rows[0]?.value);
  }

  async getPerformanceByNiche(companyId: string, range?: SearchRange): Promise<
    Array<{ nicheId: string; niche: string; appearances: number; clicks: number }>
  > {
    const where = this.buildSearchFilters(companyId, range);
    const clickExpr = sql<number>`sum(case when ${searchResults.clickTrackingId} is not null then 1 else 0 end)`;

    const rows = await this.database
      .select({
        nicheId: niches.id,
        niche: niches.label,
        appearances: sql<number>`count(${searchResults.id})`,
        clicks: clickExpr,
      })
      .from(searchResults)
      .innerJoin(searches, eq(searches.id, searchResults.searchId))
      .innerJoin(niches, eq(niches.id, searches.nicheId))
      .where(and(...where))
      .groupBy(niches.id, niches.label)
      .orderBy(desc(sql`count(${searchResults.id})`));

    return rows.map((row) => ({
      nicheId: row.nicheId,
      niche: row.niche ?? "",
      appearances: toNumber(row.appearances),
      clicks: toNumber(row.clicks),
    }));
  }

  async getPerformanceByProduct(companyId: string, range?: SearchRange): Promise<
    Array<{ productId: string; product: string; appearances: number; clicks: number }>
  > {
    const where = this.buildSearchFilters(companyId, range);
    const clickExpr = sql<number>`sum(case when ${searchResults.clickTrackingId} is not null then 1 else 0 end)`;

    const rows = await this.database
      .select({
        productId: companies.id,
        product: companies.tradeName,
        appearances: sql<number>`count(${searchResults.id})`,
        clicks: clickExpr,
      })
      .from(searchResults)
      .innerJoin(companies, eq(companies.id, searchResults.companyId))
      .innerJoin(searches, eq(searches.id, searchResults.searchId))
      .where(and(...where))
      .groupBy(companies.id, companies.tradeName)
      .orderBy(desc(sql`count(${searchResults.id})`));

    return rows.map((row) => ({
      productId: row.productId,
      product: row.product ?? "",
      appearances: toNumber(row.appearances),
      clicks: toNumber(row.clicks),
    }));
  }

  async getPerformanceByHour(companyId: string, range?: SearchRange): Promise<
    Array<{ hour: number; appearances: number; clicks: number }>
  > {
    const where = this.buildSearchFilters(companyId, range);
    const hourExpr = sql<number>`extract(hour from ${searches.createdAt})`;
    const clickExpr = sql<number>`sum(case when ${searchResults.clickTrackingId} is not null then 1 else 0 end)`;

    const rows = await this.database
      .select({
        hour: hourExpr,
        appearances: sql<number>`count(${searchResults.id})`,
        clicks: clickExpr,
      })
      .from(searchResults)
      .innerJoin(searches, eq(searches.id, searchResults.searchId))
      .where(and(...where))
      .groupBy(hourExpr)
      .orderBy(hourExpr);

    return rows.map((row) => ({
      hour: toNumber(row.hour),
      appearances: toNumber(row.appearances),
      clicks: toNumber(row.clicks),
    }));
  }

  async getPerformanceByDay(companyId: string, range?: SearchRange): Promise<
    Array<{ date: string; appearances: number; clicks: number }>
  > {
    const where = this.buildSearchFilters(companyId, range);
    const bucket = sql<string>`date_trunc('day', ${searches.createdAt})`;
    const clickExpr = sql<number>`sum(case when ${searchResults.clickTrackingId} is not null then 1 else 0 end)`;

    const rows = await this.database
      .select({
        bucket,
        appearances: sql<number>`count(${searchResults.id})`,
        clicks: clickExpr,
      })
      .from(searchResults)
      .innerJoin(searches, eq(searches.id, searchResults.searchId))
      .where(and(...where))
      .groupBy(bucket)
      .orderBy(bucket);

    return rows.map((row) => ({
      date: new Date(row.bucket).toISOString(),
      appearances: toNumber(row.appearances),
      clicks: toNumber(row.clicks),
    }));
  }

  async getOrigins(
    companyId: string,
    range?: SearchRange
  ): Promise<{ calls: number; whatsapp: number; web: number }> {
    const where = this.buildSearchFilters(companyId, range);

    const rows = await this.database
      .select({
        calls: sql<number>`sum(case when ${searchResults.clickTrackingId} ilike 'phone-%' then 1 else 0 end)`,
        whatsapp: sql<number>`sum(case when ${searchResults.clickTrackingId} ilike 'whatsapp-%' then 1 else 0 end)`,
        web: sql<number>`sum(case when ${searchResults.clickTrackingId} is not null and ${searchResults.clickTrackingId} not ilike 'phone-%' and ${searchResults.clickTrackingId} not ilike 'whatsapp-%' then 1 else 0 end)`,
      })
      .from(searchResults)
      .innerJoin(searches, eq(searches.id, searchResults.searchId))
      .where(and(...where));

    const row = rows[0] ?? {};
    return {
      calls: toNumber(row.calls as CountRow["value"]),
      whatsapp: toNumber(row.whatsapp as CountRow["value"]),
      web: toNumber(row.web as CountRow["value"]),
    };
  }
}
