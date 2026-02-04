import { and, desc, eq, gte, isNotNull, isNull, lte, or, sql } from "drizzle-orm";

import { db, type DatabaseClient } from "../../core/database/client";
import { cities, niches } from "../catalog/catalog.schema";
import { companies } from "../companies/companies.schema";

import { offeredByConfigs, offeredByEvents } from "./offered-by.schema";

export type OfferedByConfigRecord = typeof offeredByConfigs.$inferSelect;
export type OfferedByConfigInsert = typeof offeredByConfigs.$inferInsert;
export type OfferedByEventInsert = typeof offeredByEvents.$inferInsert;

export type OfferedByConfigRow = {
  config: OfferedByConfigRecord;
  company: {
    id: string;
    tradeName: string | null;
    legalName: string | null;
    website: string | null;
    phone: string | null;
    whatsapp: string | null;
  } | null;
  city: { id: string; name: string; state: string } | null;
  niche: { id: string; label: string } | null;
};

export class OfferedByRepository {
  constructor(private readonly database: DatabaseClient = db) {}

  async listConfigs(filters?: {
    companyId?: string;
    cityId?: string;
    nicheId?: string;
    isActive?: boolean;
  }): Promise<OfferedByConfigRow[]> {
    const conditions = [];
    if (filters?.companyId) {
      conditions.push(eq(offeredByConfigs.companyId, filters.companyId));
    }
    if (filters?.cityId) {
      conditions.push(eq(offeredByConfigs.cityId, filters.cityId));
    }
    if (filters?.nicheId) {
      conditions.push(eq(offeredByConfigs.nicheId, filters.nicheId));
    }
    if (typeof filters?.isActive === "boolean") {
      conditions.push(eq(offeredByConfigs.isActive, filters.isActive));
    }

    return this.database
      .select({
        config: offeredByConfigs,
        company: companies,
        city: cities,
        niche: niches,
      })
      .from(offeredByConfigs)
      .leftJoin(companies, eq(companies.id, offeredByConfigs.companyId))
      .leftJoin(cities, eq(cities.id, offeredByConfigs.cityId))
      .leftJoin(niches, eq(niches.id, offeredByConfigs.nicheId))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(offeredByConfigs.updatedAt));
  }

  async findById(id: string): Promise<OfferedByConfigRecord | undefined> {
    const [row] = await this.database
      .select()
      .from(offeredByConfigs)
      .where(eq(offeredByConfigs.id, id))
      .limit(1);
    return row;
  }

  async findRowById(id: string): Promise<OfferedByConfigRow | undefined> {
    const [row] = await this.database
      .select({
        config: offeredByConfigs,
        company: companies,
        city: cities,
        niche: niches,
      })
      .from(offeredByConfigs)
      .leftJoin(companies, eq(companies.id, offeredByConfigs.companyId))
      .leftJoin(cities, eq(cities.id, offeredByConfigs.cityId))
      .leftJoin(niches, eq(niches.id, offeredByConfigs.nicheId))
      .where(eq(offeredByConfigs.id, id))
      .limit(1);
    return row;
  }

  async createConfig(payload: OfferedByConfigInsert): Promise<OfferedByConfigRecord> {
    const [row] = await this.database
      .insert(offeredByConfigs)
      .values(payload)
      .returning();
    return row;
  }

  async updateConfig(
    id: string,
    payload: Partial<OfferedByConfigInsert>
  ): Promise<OfferedByConfigRecord | undefined> {
    const [row] = await this.database
      .update(offeredByConfigs)
      .set(payload)
      .where(eq(offeredByConfigs.id, id))
      .returning();
    return row;
  }

  async listActiveCandidates(params: {
    cityId: string;
    nicheId?: string | null;
  }): Promise<OfferedByConfigRow[]> {
    const cityId = params.cityId;
    const nicheId = params.nicheId ?? null;
    const nicheFilter =
      nicheId == null
        ? isNull(offeredByConfigs.nicheId)
        : or(isNull(offeredByConfigs.nicheId), eq(offeredByConfigs.nicheId, nicheId));

    return this.database
      .select({
        config: offeredByConfigs,
        company: companies,
        city: cities,
        niche: niches,
      })
      .from(offeredByConfigs)
      .leftJoin(companies, eq(companies.id, offeredByConfigs.companyId))
      .leftJoin(cities, eq(cities.id, offeredByConfigs.cityId))
      .leftJoin(niches, eq(niches.id, offeredByConfigs.nicheId))
      .where(
        and(
          eq(offeredByConfigs.isActive, true),
          or(isNull(offeredByConfigs.cityId), eq(offeredByConfigs.cityId, cityId)),
          nicheFilter
        )
      )
      .orderBy(desc(offeredByConfigs.updatedAt));
  }

  async insertEvent(payload: OfferedByEventInsert): Promise<void> {
    await this.database.insert(offeredByEvents).values(payload);
  }

  async getDashboardTotals(params: {
    configId: string;
    from?: Date;
    to?: Date;
  }): Promise<{
    impressions: number;
    clicks: number;
    clicksWhatsapp: number;
    clicksCall: number;
    clicksSite: number;
    clicksPromotions: number;
  }> {
    const conditions = [eq(offeredByEvents.configId, params.configId)];
    if (params.from) conditions.push(gte(offeredByEvents.createdAt, params.from));
    if (params.to) conditions.push(lte(offeredByEvents.createdAt, params.to));

    const rows = await this.database
      .select({
        impressions: sql<number>`sum(case when ${offeredByEvents.type} = 'impression' then 1 else 0 end)`,
        clicks: sql<number>`sum(case when ${offeredByEvents.type} in ('click_whatsapp','click_call','click_site','click_promotions') then 1 else 0 end)`,
        clicksWhatsapp: sql<number>`sum(case when ${offeredByEvents.type} = 'click_whatsapp' then 1 else 0 end)`,
        clicksCall: sql<number>`sum(case when ${offeredByEvents.type} = 'click_call' then 1 else 0 end)`,
        clicksSite: sql<number>`sum(case when ${offeredByEvents.type} = 'click_site' then 1 else 0 end)`,
        clicksPromotions: sql<number>`sum(case when ${offeredByEvents.type} = 'click_promotions' then 1 else 0 end)`,
      })
      .from(offeredByEvents)
      .where(and(...conditions));

    const row = rows[0] ?? {};
    const toNumber = (value: number | string | null | undefined) =>
      typeof value === "number" ? value : Number(value ?? 0) || 0;

    return {
      impressions: toNumber(row.impressions),
      clicks: toNumber(row.clicks),
      clicksWhatsapp: toNumber(row.clicksWhatsapp),
      clicksCall: toNumber(row.clicksCall),
      clicksSite: toNumber(row.clicksSite),
      clicksPromotions: toNumber(row.clicksPromotions),
    };
  }

  async getDashboardByCity(params: {
    configId: string;
    from?: Date;
    to?: Date;
  }): Promise<Array<{ cityId: string | null; city: string; total: number }>> {
    const conditions = [
      eq(offeredByEvents.configId, params.configId),
      eq(offeredByEvents.type, "impression"),
    ];
    if (params.from) conditions.push(gte(offeredByEvents.createdAt, params.from));
    if (params.to) conditions.push(lte(offeredByEvents.createdAt, params.to));

    const rows = await this.database
      .select({
        cityId: offeredByEvents.cityId,
        cityName: cities.name,
        cityState: cities.state,
        total: sql<number>`count(${offeredByEvents.id})`,
      })
      .from(offeredByEvents)
      .leftJoin(cities, eq(cities.id, offeredByEvents.cityId))
      .where(and(...conditions))
      .groupBy(offeredByEvents.cityId, cities.name, cities.state)
      .orderBy(desc(sql`count(${offeredByEvents.id})`));

    return rows.map((row) => ({
      cityId: row.cityId ?? null,
      city: row.cityName ? `${row.cityName} / ${row.cityState}` : "Sem cidade",
      total: typeof row.total === "number" ? row.total : Number(row.total ?? 0) || 0,
    }));
  }

  async getDashboardByNiche(params: {
    configId: string;
    from?: Date;
    to?: Date;
  }): Promise<Array<{ nicheId: string | null; niche: string; total: number }>> {
    const conditions = [
      eq(offeredByEvents.configId, params.configId),
      eq(offeredByEvents.type, "impression"),
      isNotNull(offeredByEvents.nicheId),
    ];
    if (params.from) conditions.push(gte(offeredByEvents.createdAt, params.from));
    if (params.to) conditions.push(lte(offeredByEvents.createdAt, params.to));

    const rows = await this.database
      .select({
        nicheId: offeredByEvents.nicheId,
        nicheLabel: niches.label,
        total: sql<number>`count(${offeredByEvents.id})`,
      })
      .from(offeredByEvents)
      .leftJoin(niches, eq(niches.id, offeredByEvents.nicheId))
      .where(and(...conditions))
      .groupBy(offeredByEvents.nicheId, niches.label)
      .orderBy(desc(sql`count(${offeredByEvents.id})`));

    return rows.map((row) => ({
      nicheId: row.nicheId ?? null,
      niche: row.nicheLabel ?? "Sem nicho",
      total: typeof row.total === "number" ? row.total : Number(row.total ?? 0) || 0,
    }));
  }

  async getDashboardBySearchType(params: {
    configId: string;
    from?: Date;
    to?: Date;
  }): Promise<Array<{ searchType: string; total: number }>> {
    const conditions = [
      eq(offeredByEvents.configId, params.configId),
      eq(offeredByEvents.type, "impression"),
    ];
    if (params.from) conditions.push(gte(offeredByEvents.createdAt, params.from));
    if (params.to) conditions.push(lte(offeredByEvents.createdAt, params.to));

    const rows = await this.database
      .select({
        searchType: offeredByEvents.searchType,
        total: sql<number>`count(${offeredByEvents.id})`,
      })
      .from(offeredByEvents)
      .where(and(...conditions))
      .groupBy(offeredByEvents.searchType)
      .orderBy(desc(sql`count(${offeredByEvents.id})`));

    return rows.map((row) => ({
      searchType: row.searchType ?? "niche",
      total: typeof row.total === "number" ? row.total : Number(row.total ?? 0) || 0,
    }));
  }

  async getDashboardByDay(params: {
    configId: string;
    from?: Date;
    to?: Date;
  }): Promise<Array<{ day: string; total: number }>> {
    const conditions = [
      eq(offeredByEvents.configId, params.configId),
      eq(offeredByEvents.type, "impression"),
    ];
    if (params.from) conditions.push(gte(offeredByEvents.createdAt, params.from));
    if (params.to) conditions.push(lte(offeredByEvents.createdAt, params.to));

    const rows = await this.database
      .select({
        day: sql<Date>`date_trunc('day', ${offeredByEvents.createdAt})`,
        total: sql<number>`count(${offeredByEvents.id})`,
      })
      .from(offeredByEvents)
      .where(and(...conditions))
      .groupBy(sql`date_trunc('day', ${offeredByEvents.createdAt})`)
      .orderBy(desc(sql`date_trunc('day', ${offeredByEvents.createdAt})`));

    return rows.map((row) => ({
      day:
        row.day instanceof Date
          ? row.day.toISOString().slice(0, 10)
          : String(row.day),
      total: typeof row.total === "number" ? row.total : Number(row.total ?? 0) || 0,
    }));
  }

  async getDashboardByHour(params: {
    configId: string;
    from?: Date;
    to?: Date;
  }): Promise<Array<{ hour: number; total: number }>> {
    const conditions = [
      eq(offeredByEvents.configId, params.configId),
      eq(offeredByEvents.type, "impression"),
    ];
    if (params.from) conditions.push(gte(offeredByEvents.createdAt, params.from));
    if (params.to) conditions.push(lte(offeredByEvents.createdAt, params.to));

    const rows = await this.database
      .select({
        hour: sql<number>`extract(hour from ${offeredByEvents.createdAt})`,
        total: sql<number>`count(${offeredByEvents.id})`,
      })
      .from(offeredByEvents)
      .where(and(...conditions))
      .groupBy(sql`extract(hour from ${offeredByEvents.createdAt})`)
      .orderBy(desc(sql`count(${offeredByEvents.id})`));

    return rows.map((row) => ({
      hour: typeof row.hour === "number" ? row.hour : Number(row.hour ?? 0) || 0,
      total: typeof row.total === "number" ? row.total : Number(row.total ?? 0) || 0,
    }));
  }
}
