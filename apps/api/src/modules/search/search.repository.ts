import { and, asc, count, desc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";

import { db, type DatabaseClient } from "../../core/database/client";
import { cities, niches } from "../catalog/catalog.schema";
import { companies, companyNiches } from "../companies/companies.schema";

import { searchEvents, searchResults, searches } from "./search.schema";
import { getMinimumTokenMatches, normalizeColumnForSearch, tokenizeSearch } from "./search-text";

type SearchRecord = typeof searches.$inferSelect;
type SearchInsert = typeof searches.$inferInsert;
export type SearchResultInsert = typeof searchResults.$inferInsert;
export type SearchEventInsert = typeof searchEvents.$inferInsert;

type CompanyRecord = typeof companies.$inferSelect;
type CityRecord = typeof cities.$inferSelect;
type NicheRecord = typeof niches.$inferSelect;

export type CompanySummary = {
  company: CompanyRecord;
  city: CityRecord | null;
  niches: NicheRecord[];
};

type DbSession =
  | DatabaseClient
  | Parameters<Parameters<DatabaseClient["transaction"]>[0]>[0];

export class SearchRepository {
  async listCities(): Promise<CityRecord[]> {
    return db.select().from(cities);
  }

  async listNiches(): Promise<NicheRecord[]> {
    return db.select().from(niches);
  }

  async findCityById(cityId: string): Promise<CityRecord | undefined> {
    const [city] = await db.select().from(cities).where(eq(cities.id, cityId)).limit(1);
    return city;
  }

  async findCityByName(name: string): Promise<CityRecord | null> {
    const normalized = name.trim().toLowerCase();
    if (!normalized) return null;
    const [city] = await db
      .select()
      .from(cities)
      .where(sql`lower(${cities.name}) = ${normalized}`)
      .limit(1);
    return city ?? null;
  }

  async findNicheById(nicheId: string): Promise<NicheRecord | undefined> {
    const [niche] = await db.select().from(niches).where(eq(niches.id, nicheId)).limit(1);
    return niche;
  }

  async findNicheByLabelOrSlug(text: string): Promise<NicheRecord | null> {
    const normalized = text.trim().toLowerCase();
    if (!normalized) return null;
    const [niche] = await db
      .select()
      .from(niches)
      .where(
        sql`lower(${niches.label}) = ${normalized} or lower(${niches.slug}) = ${normalized}`
      )
      .limit(1);
    return niche ?? null;
  }

  async countActiveCompaniesByCityNiche(params: {
    cityId: string;
    nicheId: string;
  }): Promise<number> {
    const [row] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(companies)
      .innerJoin(
        companyNiches,
        and(
          eq(companyNiches.companyId, companies.id),
          eq(companyNiches.nicheId, params.nicheId)
        )
      )
      .where(
        and(eq(companies.cityId, params.cityId), eq(companies.status, "active"))
      );

    return Number(row?.value ?? 0);
  }

  async getSearchAnalytics(filters: {
    from?: string;
    to?: string;
    cityId?: string;
    nicheId?: string;
    companyId?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{
    items: Array<{
      searchId: string;
      createdAt: Date | null;
      cityName: string | null;
      cityState: string | null;
      nicheLabel: string | null;
      query: string | null;
      totalResults: number | null;
      paidResults: number | null;
      totalCharged: string | null;
      hasClicks: number | null;
    }>;
    total: number;
    page: number;
    pageSize: number;
  }> {
    const page = Math.max(filters.page ?? 1, 1);
    const pageSize = Math.max(Math.min(filters.pageSize ?? 20, 100), 1);
    const offset = (page - 1) * pageSize;

    const whereClause = this.buildSearchWhere(filters);

    const totalQuery = await db
      .select({
        value: sql<number>`count(distinct ${searches.id})`,
      })
      .from(searches)
      .leftJoin(searchResults, eq(searchResults.searchId, searches.id))
      .where(whereClause ?? undefined);

    const total = Number(totalQuery[0]?.value ?? 0);

    const paidCount = sql<number>`sum(case when ${searchResults.isPaid} = true then 1 else 0 end)`;
    const clickFlag = sql<number>`max(case when ${searchResults.clickTrackingId} is not null then 1 else 0 end)`;
    const totalCharged = sql<string>`sum(${searchResults.chargedAmount})`;

    const rows = await db
      .select({
        searchId: searches.id,
        createdAt: searches.createdAt,
        cityName: cities.name,
        cityState: cities.state,
        nicheLabel: niches.label,
        query: searches.queryText,
        totalResults: count(searchResults.id),
        paidResults: paidCount,
        totalCharged,
        hasClicks: clickFlag,
      })
      .from(searches)
      .leftJoin(searchResults, eq(searchResults.searchId, searches.id))
      .leftJoin(cities, eq(searches.cityId, cities.id))
      .leftJoin(niches, eq(searches.nicheId, niches.id))
      .where(whereClause ?? undefined)
      .groupBy(
        searches.id,
        searches.createdAt,
        cities.name,
        cities.state,
        niches.label,
        searches.queryText
      )
      .orderBy(desc(searches.createdAt))
      .limit(pageSize)
      .offset(offset);

    return {
      items: rows,
      total,
      page,
      pageSize,
    };
  }

  async insertSearch(
    client: DbSession,
    payload: SearchInsert
  ): Promise<SearchRecord> {
    const [search] = await client.insert(searches).values(payload).returning();
    return search;
  }

  async insertResults(
    client: DbSession,
    results: SearchResultInsert[]
  ): Promise<void> {
    if (results.length === 0) {
      return;
    }

    await client.insert(searchResults).values(results);
  }

  async saveSearchWithResults(params: {
    search: SearchInsert;
    results: SearchResultInsert[];
  }): Promise<void> {
    await db.transaction(async (tx) => {
      await this.insertSearch(tx, params.search);
      await this.insertResults(tx, params.results);
    });
  }

  async registerClick(
    searchId: SearchRecord["id"],
    companyId: string,
    clickTrackingId: string
  ): Promise<void> {
    await db
      .update(searchResults)
      .set({ clickTrackingId })
      .where(
        and(eq(searchResults.searchId, searchId), eq(searchResults.companyId, companyId))
      );
  }

  async registerClickByResultId(
    resultId: string,
    clickTrackingId: string
  ): Promise<void> {
    await db
      .update(searchResults)
      .set({ clickTrackingId })
      .where(eq(searchResults.id, resultId));
  }

  async findSearchById(searchId: string): Promise<SearchRecord | null> {
    const [row] = await db.select().from(searches).where(eq(searches.id, searchId)).limit(1);
    return row ?? null;
  }

  async searchEventExists(searchId: string, type: string): Promise<boolean> {
    const [row] = await db
      .select({ id: searchEvents.id })
      .from(searchEvents)
      .where(and(eq(searchEvents.searchId, searchId), eq(searchEvents.type, type)))
      .limit(1);
    return Boolean(row);
  }

  async searchEventExistsForCompany(
    searchId: string,
    companyId: string,
    type: string
  ): Promise<boolean> {
    const [row] = await db
      .select({ id: searchEvents.id })
      .from(searchEvents)
      .where(
        and(
          eq(searchEvents.searchId, searchId),
          eq(searchEvents.companyId, companyId),
          eq(searchEvents.type, type)
        )
      )
      .limit(1);
    return Boolean(row);
  }

  async insertSearchEvent(payload: SearchEventInsert): Promise<void> {
    await db.insert(searchEvents).values(payload);
  }

  async insertImpressionEventIfMissing(params: {
    searchId: string;
    companyId: string;
    meta?: SearchEventInsert["meta"];
  }): Promise<boolean> {
    const rows = await db
      .insert(searchEvents)
      .values({
        searchId: params.searchId,
        companyId: params.companyId,
        type: "impression",
        meta: params.meta ?? null,
      })
      .onConflictDoNothing()
      .returning({ id: searchEvents.id });
    return rows.length > 0;
  }

  async deleteSearchEvent(params: {
    searchId: string;
    companyId: string;
    type: SearchEventInsert["type"];
  }): Promise<void> {
    await db
      .delete(searchEvents)
      .where(
        and(
          eq(searchEvents.searchId, params.searchId),
          eq(searchEvents.companyId, params.companyId),
          eq(searchEvents.type, params.type)
        )
      );
  }

  async updateSearchResultPaidStatus(params: {
    searchId: string;
    companyId: string;
    isPaid: boolean;
    chargedAmount: number;
  }): Promise<void> {
    await db
      .update(searchResults)
      .set({
        isPaid: params.isPaid,
        chargedAmount: params.chargedAmount.toString(),
      })
      .where(
        and(eq(searchResults.searchId, params.searchId), eq(searchResults.companyId, params.companyId))
      );
  }

  async insertSearchEventReturning(
    payload: SearchEventInsert,
    client: DbSession = db
  ): Promise<typeof searchEvents.$inferSelect> {
    const [row] = await client.insert(searchEvents).values(payload).returning();
    return row;
  }

  async searchResultExists(searchId: string, companyId: string): Promise<boolean> {
    const [row] = await db
      .select({ id: searchResults.id })
      .from(searchResults)
      .where(and(eq(searchResults.searchId, searchId), eq(searchResults.companyId, companyId)))
      .limit(1);

    return Boolean(row);
  }

  async findResultById(resultId: string): Promise<(typeof searchResults.$inferSelect) | null> {
    const [row] = await db
      .select()
      .from(searchResults)
      .where(eq(searchResults.id, resultId))
      .limit(1);
    return row ?? null;
  }

  async findResultBySearchAndCompany(
    searchId: string,
    companyId: string,
    client: DbSession = db
  ): Promise<(typeof searchResults.$inferSelect) | null> {
    const [row] = await client
      .select()
      .from(searchResults)
      .where(and(eq(searchResults.searchId, searchId), eq(searchResults.companyId, companyId)))
      .orderBy(desc(searchResults.isPaid), asc(searchResults.position))
      .limit(1);
    return row ?? null;
  }

  async getPaidSpendByCompanyAndConfig(params: {
    companyId: string;
    cityId: string;
    nicheId: string;
    from: Date;
    to: Date;
  }): Promise<number> {
    const amountExpr = sql<number>`coalesce(sum(cast(${searchEvents.meta} ->> 'amount' as numeric)), 0)`;

    const rows = await db
      .select({ value: amountExpr })
      .from(searchEvents)
      .innerJoin(searches, eq(searches.id, searchEvents.searchId))
      .where(
        and(
          eq(searchEvents.type, "impression"),
          eq(searchEvents.companyId, params.companyId),
          eq(searches.nicheId, params.nicheId),
          eq(searches.cityId, params.cityId),
          gte(searchEvents.createdAt, params.from),
          lte(searchEvents.createdAt, params.to)
        )
      );

    const value = Number(rows[0]?.value ?? 0);
    return Number.isNaN(value) ? 0 : value;
  }

  async sumImpressionAmountByCompanyAndConfig(params: {
    companyId: string;
    cityId: string;
    nicheId: string;
    from: Date;
    to: Date;
  }): Promise<number> {
    const amountExpr = sql<number>`coalesce(sum(cast(${searchEvents.meta} ->> 'amount' as numeric)), 0)`;

    const rows = await db
      .select({ value: amountExpr })
      .from(searchEvents)
      .innerJoin(searches, eq(searches.id, searchEvents.searchId))
      .where(
        and(
          eq(searchEvents.type, "impression"),
          eq(searchEvents.companyId, params.companyId),
          eq(searches.nicheId, params.nicheId),
          eq(searches.cityId, params.cityId),
          gte(searchEvents.createdAt, params.from),
          lte(searchEvents.createdAt, params.to)
        )
      );

    const value = Number(rows[0]?.value ?? 0);
    return Number.isNaN(value) ? 0 : value;
  }

  async countImpressionsWithMissingAmountByCompanyAndConfig(params: {
    companyId: string;
    cityId: string;
    nicheId: string;
    from: Date;
    to: Date;
  }): Promise<number> {
    const amountValue = sql<number>`coalesce(cast(${searchEvents.meta} ->> 'amount' as numeric), 0)`;

    const rows = await db
      .select({ value: sql<number>`count(${searchEvents.id})` })
      .from(searchEvents)
      .innerJoin(searches, eq(searches.id, searchEvents.searchId))
      .where(
        and(
          eq(searchEvents.type, "impression"),
          eq(searchEvents.companyId, params.companyId),
          eq(searches.nicheId, params.nicheId),
          eq(searches.cityId, params.cityId),
          gte(searchEvents.createdAt, params.from),
          lte(searchEvents.createdAt, params.to),
          sql`${amountValue} = 0`
        )
      );

    return Number(rows[0]?.value ?? 0);
  }

  async countPaidImpressionsByCompanyAndConfig(params: {
    companyId: string;
    cityId: string;
    nicheId: string;
    from: Date;
    to: Date;
  }): Promise<number> {
    const rows = await db
      .select({ value: sql<number>`count(${searchEvents.id})` })
      .from(searchEvents)
      .innerJoin(searches, eq(searches.id, searchEvents.searchId))
      .where(
        and(
          eq(searchEvents.type, "impression"),
          eq(searchEvents.companyId, params.companyId),
          eq(searches.nicheId, params.nicheId),
          eq(searches.cityId, params.cityId),
          gte(searchEvents.createdAt, params.from),
          lte(searchEvents.createdAt, params.to)
        )
      );

    return Number(rows[0]?.value ?? 0);
  }

  async countPaidResultsByCompanyAndConfig(params: {
    companyId: string;
    cityId: string;
    nicheId: string;
    from: Date;
    to: Date;
  }): Promise<number> {
    const rows = await db
      .select({ value: sql<number>`count(${searchResults.id})` })
      .from(searchResults)
      .innerJoin(searches, eq(searches.id, searchResults.searchId))
      .where(
        and(
          eq(searchResults.companyId, params.companyId),
          eq(searchResults.isPaid, true),
          lte(searchResults.position, 3),
          eq(searches.nicheId, params.nicheId),
          eq(searches.cityId, params.cityId),
          gte(searches.createdAt, params.from),
          lte(searches.createdAt, params.to)
        )
      );

    return Number(rows[0]?.value ?? 0);
  }

  async countClicksByCompanyAndConfig(params: {
    companyId: string;
    cityId: string;
    nicheId: string;
    from: Date;
    to: Date;
  }): Promise<number> {
    const rows = await db
      .select({ value: sql<number>`count(${searchEvents.id})` })
      .from(searchEvents)
      .innerJoin(searches, eq(searches.id, searchEvents.searchId))
      .where(
        and(
          eq(searchEvents.companyId, params.companyId),
          eq(searches.nicheId, params.nicheId),
          eq(searches.cityId, params.cityId),
          gte(searchEvents.createdAt, params.from),
          lte(searchEvents.createdAt, params.to),
          sql`${searchEvents.type} in ('click_whatsapp','click_call')`
        )
      );

    return Number(rows[0]?.value ?? 0);
  }

  async getAveragePaidPositionByCompanyAndConfig(params: {
    companyId: string;
    cityId: string;
    nicheId: string;
    from: Date;
    to: Date;
  }): Promise<number | null> {
    const rows = await db
      .select({ value: sql<number | null>`avg(${searchResults.position})` })
      .from(searchResults)
      .innerJoin(searches, eq(searches.id, searchResults.searchId))
      .where(
        and(
          eq(searchResults.companyId, params.companyId),
          eq(searchResults.isPaid, true),
          lte(searchResults.position, 3),
          eq(searches.nicheId, params.nicheId),
          eq(searches.cityId, params.cityId),
          gte(searches.createdAt, params.from),
          lte(searches.createdAt, params.to)
        )
      );

    const value = rows[0]?.value ?? null;
    return value === null || Number.isNaN(Number(value)) ? null : Number(value);
  }

  async findCompaniesByIds(companyIds: string[]): Promise<CompanySummary[]> {
    if (companyIds.length === 0) {
      return [];
    }

    const rows = await db
      .select({
        company: companies,
        city: cities,
        niche: niches,
      })
      .from(companies)
      .leftJoin(cities, eq(companies.cityId, cities.id))
      .leftJoin(companyNiches, eq(companyNiches.companyId, companies.id))
      .leftJoin(niches, eq(companyNiches.nicheId, niches.id))
      .where(inArray(companies.id, companyIds))
      .orderBy(asc(companies.createdAt));

    const summaries = new Map<string, CompanySummary>();

    rows.forEach((row) => {
      const companyId = row.company.id;
      const current = summaries.get(companyId) ?? {
        company: row.company,
        city: row.city,
        niches: [] as NicheRecord[],
      };

      if (row.niche) {
        current.niches.push(row.niche);
      }

      summaries.set(companyId, current);
    });

    return Array.from(summaries.values());
  }

  async searchCompaniesByDirectQuery(params: {
    query: string;
    cityId?: string;
    limit?: number;
  }): Promise<CompanySummary[]> {
    const limit = Math.max(1, Math.min(params.limit ?? 5, 20));
    const tokens = tokenizeSearch(params.query);
    const digits = params.query.replace(/\D/g, "");
    const hasDigits = digits.length >= 8;
    if (tokens.length === 0 && !hasDigits) {
      return [];
    }

    const normalizedName = normalizeColumnForSearch(companies.tradeName);
    const normalizedAddress = normalizeColumnForSearch(companies.address);

    const matchCases = tokens.map(
      (token) => sql<number>`case when ${normalizedName} like ${`%${token}%`} then 1 else 0 end`
    );
    const addressCases = tokens.map(
      (token) => sql<number>`case when ${normalizedAddress} like ${`%${token}%`} then 1 else 0 end`
    );
    const prefixCases = tokens.map(
      (token) => sql<number>`case when ${normalizedName} like ${`${token}%`} then 1 else 0 end`
    );

    const matchExpr =
      matchCases.length === 0
        ? sql<number>`0`
        : matchCases.length === 1
          ? matchCases[0]
          : sql<number>`(${sql.join(matchCases, sql` + `)})`;
    const addressExpr =
      addressCases.length === 0
        ? sql<number>`0`
        : addressCases.length === 1
          ? addressCases[0]
          : sql<number>`(${sql.join(addressCases, sql` + `)})`;
    const prefixExpr =
      prefixCases.length === 0
        ? sql<number>`0`
        : prefixCases.length === 1
          ? prefixCases[0]
          : sql<number>`(${sql.join(prefixCases, sql` + `)})`;

    const minMatches = getMinimumTokenMatches(tokens.length);
    const textCondition =
      tokens.length === 0
        ? null
        : tokens.length === 1
          ? sql`(${normalizedName} like ${`%${tokens[0]}%`} or ${normalizedAddress} like ${`%${tokens[0]}%`})`
          : sql`(${matchExpr} >= ${minMatches} or ${addressExpr} >= ${minMatches})`;

    const phoneDigits = sql<string>`regexp_replace(coalesce(${companies.phone}, ''), '\\D', '', 'g')`;
    const whatsappDigits = sql<string>`regexp_replace(coalesce(${companies.whatsapp}, ''), '\\D', '', 'g')`;
    const phoneCondition = hasDigits
      ? sql`(${phoneDigits} like ${`%${digits}%`} or ${whatsappDigits} like ${`%${digits}%`})`
      : null;
    const phoneScoreExpr = hasDigits
      ? sql<number>`case when ${phoneCondition} then 3 else 0 end`
      : sql<number>`0`;

    const conditions = [eq(companies.status, "active")];
    if (params.cityId) {
      conditions.push(eq(companies.cityId, params.cityId));
    }

    if (textCondition && phoneCondition) {
      conditions.push(or(textCondition, phoneCondition));
    } else if (textCondition) {
      conditions.push(textCondition);
    } else if (phoneCondition) {
      conditions.push(phoneCondition);
    } else {
      return [];
    }

    const scoreExpr = sql<number>`(${matchExpr} * 2 + ${prefixExpr} + ${addressExpr} + ${phoneScoreExpr})`;
    const candidates = await db
      .select({ id: companies.id })
      .from(companies)
      .where(and(...conditions))
      .orderBy(desc(scoreExpr), asc(companies.tradeName))
      .limit(limit);

    if (!candidates.length) {
      return [];
    }

    const orderedIds = candidates.map((row) => row.id);
    const summaries = await this.findCompaniesByIds(orderedIds);
    const summaryMap = new Map(summaries.map((summary) => [summary.company.id, summary]));
    return orderedIds.map((id) => summaryMap.get(id)).filter(Boolean) as CompanySummary[];
  }

  private buildSearchWhere(filters: {
    from?: string;
    to?: string;
    cityId?: string;
    nicheId?: string;
    companyId?: string;
  }) {
    const conditions = [];

    if (filters.cityId) {
      conditions.push(eq(searches.cityId, filters.cityId));
    }

    if (filters.nicheId) {
      conditions.push(eq(searches.nicheId, filters.nicheId));
    }

    if (filters.from) {
      conditions.push(gte(searches.createdAt, new Date(filters.from)));
    }

    if (filters.to) {
      conditions.push(lte(searches.createdAt, new Date(filters.to)));
    }

    if (filters.companyId) {
      conditions.push(eq(searchResults.companyId, filters.companyId));
    }

    if (conditions.length === 0) {
      return undefined;
    }

    return and(...conditions);
  }
}
