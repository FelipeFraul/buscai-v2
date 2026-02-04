import { and, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";

import { db } from "../../core/database/client";
import { auctionConfigs } from "../auction/auction.schema";
import { companies, companyNiches } from "../companies/companies.schema";
import { cities, niches } from "../catalog/catalog.schema";
import { contactEvents } from "../contacts/contact.schema";
import { productOffers } from "../products/products.schema";
import { searchEvents, searchResults, searches } from "../search/search.schema";
import {
  SerpapiRecordStatus,
  serpapiApiKeys,
  serpapiImportRecords,
  serpapiImportRuns,
  serpapiSettings,
} from "./serpapi.schema";

export type SerpapiRun = {
  id: string;
  status: string;
  initiatedByUserId: string | null;
  cityId: string | null;
  nicheId: string | null;
  query: string | null;
  paramsJson: string | null;
  dryRun: boolean;
  foundCount: number;
  insertedCount: number;
  updatedCount: number;
  conflictCount: number;
  errorCount: number;
  dedupedCount: number;
  createdAt: Date;
  finishedAt: Date | null;
};

export type SerpapiRecordRow = {
  id: string;
  runId: string;
  rawPayload: unknown;
  dedupeKey: string | null;
  companyId: string | null;
  status: string;
  reason: string | null;
  createdAt: Date;
};

export class SerpapiRepository {
  private slugify(label: string): string {
    return label
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120);
  }

  buildNicheSlug(label: string): string {
    return this.slugify(label);
  }

  async ensureNiche(label: string) {
    const trimmed = label.trim();
    if (!trimmed) {
      return null;
    }
    const normalized = trimmed.toLowerCase();
    const slug = this.slugify(trimmed);

    const [existing] = await db
      .select({ id: niches.id, label: niches.label })
      .from(niches)
      .where(sql`lower(${niches.label}) = ${normalized} or lower(${niches.slug}) = ${normalized}`)
      .limit(1);

    if (existing) {
      return existing;
    }

    const [created] = await db
      .insert(niches)
      .values({ label: trimmed, slug, isActive: true })
      .onConflictDoNothing()
      .returning({ id: niches.id, label: niches.label });

    if (created) {
      return created;
    }

    const [fallback] = await db
      .select({ id: niches.id, label: niches.label })
      .from(niches)
      .where(eq(niches.slug, slug))
      .limit(1);

    return fallback ?? null;
  }

  async findNicheBySlug(slug: string) {
    const [row] = await db
      .select({ id: niches.id })
      .from(niches)
      .where(eq(niches.slug, slug))
      .limit(1);
    return row ?? null;
  }

  async getNicheForUpdate(nicheId: string) {
    const [row] = await db
      .select({ id: niches.id, label: niches.label, slug: niches.slug })
      .from(niches)
      .where(eq(niches.id, nicheId))
      .limit(1);
    return row ?? null;
  }

  async updateNiche(nicheId: string, payload: { label: string; slug: string }) {
    const [row] = await db
      .update(niches)
      .set({
        label: payload.label,
        slug: payload.slug,
      })
      .where(eq(niches.id, nicheId))
      .returning({ id: niches.id, label: niches.label, slug: niches.slug });
    return row ?? null;
  }

  async linkCompanyToNiche(companyId: string, nicheId: string) {
    await db.insert(companyNiches).values({ companyId, nicheId }).onConflictDoNothing();
  }

  async countSerpapiNicheLinks() {
    const rows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(companyNiches)
      .innerJoin(companies, eq(companyNiches.companyId, companies.id))
      .where(eq(companies.source, "serpapi"));

    return Number(rows[0]?.count ?? 0);
  }

  async listManualImportRecordsForNicheBackfill() {
    const rows = await db
      .select({
        companyId: serpapiImportRecords.companyId,
        rawPayload: serpapiImportRecords.rawPayload,
      })
      .from(serpapiImportRecords)
      .innerJoin(serpapiImportRuns, eq(serpapiImportRecords.runId, serpapiImportRuns.id))
      .where(
        and(eq(serpapiImportRuns.query, "manual_upload"), isNotNull(serpapiImportRecords.companyId))
      );

    return rows.map((row) => ({
      companyId: row.companyId as string,
      rawPayload: row.rawPayload,
    }));
  }
  async listNicheDistribution(query?: string) {
    const conditions = [];
    if (query?.trim()) {
      const normalized = `%${query.toLowerCase()}%`;
      conditions.push(sql`LOWER(${niches.label}) LIKE ${normalized}`);
    }

    const rows = await db
      .select({
        nicheId: niches.id,
        nicheName: niches.label,
        companiesCount: sql<number>`COUNT(DISTINCT ${companies.id})`,
      })
      .from(niches)
      .leftJoin(companyNiches, eq(companyNiches.nicheId, niches.id))
      .leftJoin(companies, eq(companyNiches.companyId, companies.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .groupBy(niches.id, niches.label)
      .orderBy(desc(sql<number>`COUNT(DISTINCT ${companies.id})`));

    return rows ?? [];
  }

  async getSerpapiApiKey() {
    try {
      const [row] = await db
        .select({
          apiKeyEncrypted: serpapiSettings.apiKeyEncrypted,
          apiKeyUpdatedAt: serpapiSettings.apiKeyUpdatedAt,
          activeApiKeyId: serpapiSettings.activeApiKeyId,
        })
        .from(serpapiSettings)
        .where(eq(serpapiSettings.id, "global"))
        .limit(1);

      return row ?? null;
    } catch {
      try {
        const [row] = await db
          .select({
            apiKeyEncrypted: serpapiSettings.apiKeyEncrypted,
            apiKeyUpdatedAt: serpapiSettings.apiKeyUpdatedAt,
          })
          .from(serpapiSettings)
          .where(eq(serpapiSettings.id, "global"))
          .limit(1);

        return row ? { ...row, activeApiKeyId: null } : null;
      } catch {
        return null;
      }
    }
  }

  async upsertSerpapiApiKey(apiKeyEncrypted: string, activeApiKeyId?: string | null) {
    const [row] = await db
      .insert(serpapiSettings)
      .values({
        id: "global",
        apiKeyEncrypted,
        activeApiKeyId: activeApiKeyId ?? null,
      })
      .onConflictDoUpdate({
        target: serpapiSettings.id,
        set: {
          apiKeyEncrypted,
          activeApiKeyId: activeApiKeyId ?? sql`${serpapiSettings.activeApiKeyId}`,
          apiKeyUpdatedAt: sql`now()`,
        },
      })
      .returning({
        apiKeyUpdatedAt: serpapiSettings.apiKeyUpdatedAt,
      });

    return row ?? null;
  }

  async listSerpapiApiKeys() {
    try {
      const rows = await db
        .select({
          id: serpapiApiKeys.id,
          apiKeyEncrypted: serpapiApiKeys.apiKeyEncrypted,
          label: serpapiApiKeys.label,
          createdAt: serpapiApiKeys.createdAt,
          updatedAt: serpapiApiKeys.updatedAt,
          lastUsedAt: serpapiApiKeys.lastUsedAt,
        })
        .from(serpapiApiKeys)
        .orderBy(desc(serpapiApiKeys.updatedAt));

      return rows ?? [];
    } catch {
      return [];
    }
  }

  async getSerpapiApiKeyById(id: string) {
    const [row] = await db
      .select({
        id: serpapiApiKeys.id,
        apiKeyEncrypted: serpapiApiKeys.apiKeyEncrypted,
        label: serpapiApiKeys.label,
        createdAt: serpapiApiKeys.createdAt,
        updatedAt: serpapiApiKeys.updatedAt,
        lastUsedAt: serpapiApiKeys.lastUsedAt,
      })
      .from(serpapiApiKeys)
      .where(eq(serpapiApiKeys.id, id))
      .limit(1);

    return row ?? null;
  }

  async insertSerpapiApiKey(apiKeyEncrypted: string, label?: string | null) {
    const [row] = await db
      .insert(serpapiApiKeys)
      .values({
        apiKeyEncrypted,
        label: label ?? null,
      })
      .returning({
        id: serpapiApiKeys.id,
        createdAt: serpapiApiKeys.createdAt,
        updatedAt: serpapiApiKeys.updatedAt,
      });

    return row ?? null;
  }

  async touchSerpapiApiKey(id: string) {
    await db
      .update(serpapiApiKeys)
      .set({
        lastUsedAt: sql`now()`,
      })
      .where(eq(serpapiApiKeys.id, id));
  }

  async getAllTimeMetrics() {
    const [companiesRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(companies);
    const [nichesRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(niches);
    const [citiesRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(cities);

    const [topCity] = await db
      .select({
        cityId: cities.id,
        cityName: cities.name,
        cityState: cities.state,
        companiesCount: sql<number>`count(${companies.id})::int`,
      })
      .from(companies)
      .innerJoin(cities, eq(companies.cityId, cities.id))
      .groupBy(cities.id, cities.name, cities.state)
      .orderBy(desc(sql<number>`count(${companies.id})`))
      .limit(1);

    const [topNiche] = await db
      .select({
        nicheId: niches.id,
        nicheName: niches.label,
        companiesCount: sql<number>`count(distinct ${companyNiches.companyId})::int`,
      })
      .from(companyNiches)
      .innerJoin(niches, eq(companyNiches.nicheId, niches.id))
      .groupBy(niches.id, niches.label)
      .orderBy(desc(sql<number>`count(distinct ${companyNiches.companyId})`))
      .limit(1);

    return {
      totalCompanies: Number(companiesRow?.count ?? 0),
      totalNiches: Number(nichesRow?.count ?? 0),
      totalCities: Number(citiesRow?.count ?? 0),
      topCity: topCity ?? null,
      topNiche: topNiche ?? null,
    };
  }

  async createRun(params: {
    cityId: string | null;
    nicheId: string | null;
    query: string | null;
    limit: number;
    dryRun: boolean;
    initiatedByUserId: string;
    paramsJson: string | null;
  }): Promise<SerpapiRun> {
    const [created] = await db
      .insert(serpapiImportRuns)
      .values({
        initiatedByUserId: params.initiatedByUserId,
        cityId: params.cityId,
        nicheId: params.nicheId,
        query: params.query,
        paramsJson: params.paramsJson,
        dryRun: params.dryRun,
      })
      .returning({
        id: serpapiImportRuns.id,
        status: serpapiImportRuns.status,
        initiatedByUserId: serpapiImportRuns.initiatedByUserId,
        cityId: serpapiImportRuns.cityId,
        nicheId: serpapiImportRuns.nicheId,
        query: serpapiImportRuns.query,
        paramsJson: serpapiImportRuns.paramsJson,
        dryRun: serpapiImportRuns.dryRun,
        foundCount: serpapiImportRuns.foundCount,
        insertedCount: serpapiImportRuns.insertedCount,
        updatedCount: serpapiImportRuns.updatedCount,
        conflictCount: serpapiImportRuns.conflictCount,
        errorCount: serpapiImportRuns.errorCount,
        dedupedCount: serpapiImportRuns.dedupedCount,
        createdAt: serpapiImportRuns.createdAt,
        finishedAt: serpapiImportRuns.finishedAt,
      });

    return created;
  }

  async updateRunStatus(
    runId: string,
    status: string,
    counts?: Partial<{
      foundCount: number;
      insertedCount: number;
      updatedCount: number;
      conflictCount: number;
      errorCount: number;
      dedupedCount: number;
    }>
  ) {
    await db
      .update(serpapiImportRuns)
      .set({
        status,
        foundCount: counts?.foundCount ?? undefined,
        insertedCount: counts?.insertedCount ?? undefined,
        updatedCount: counts?.updatedCount ?? undefined,
        conflictCount: counts?.conflictCount ?? undefined,
        errorCount: counts?.errorCount ?? undefined,
        dedupedCount: counts?.dedupedCount ?? undefined,
        finishedAt: status === "running" ? null : new Date(),
      })
      .where(eq(serpapiImportRuns.id, runId));
  }

  async incrementCounts(runId: string, deltas: Partial<{
    foundCount: number;
    insertedCount: number;
    updatedCount: number;
    conflictCount: number;
    errorCount: number;
  }>) {
    const updates: Record<string, unknown> = {};
    if (deltas.foundCount) {
      updates.foundCount = sql`${serpapiImportRuns.foundCount} + ${deltas.foundCount}`;
    }
    if (deltas.insertedCount) {
      updates.insertedCount = sql`${serpapiImportRuns.insertedCount} + ${deltas.insertedCount}`;
    }
    if (deltas.updatedCount) {
      updates.updatedCount = sql`${serpapiImportRuns.updatedCount} + ${deltas.updatedCount}`;
    }
    if (deltas.conflictCount) {
      updates.conflictCount = sql`${serpapiImportRuns.conflictCount} + ${deltas.conflictCount}`;
    }
    if (deltas.errorCount) {
      updates.errorCount = sql`${serpapiImportRuns.errorCount} + ${deltas.errorCount}`;
    }

    if (Object.keys(updates).length === 0) {
      return;
    }

    await db
      .update(serpapiImportRuns)
      .set(updates)
      .where(eq(serpapiImportRuns.id, runId));
  }

  async listRuns(
    limit: number,
    offset: number,
    filters?: { excludeTests?: boolean }
  ) {
    const conditions = [];
    if (filters?.excludeTests) {
      conditions.push(
        sql`(${serpapiImportRuns.query} is null or (lower(${serpapiImportRuns.query}) not like '%test%' and lower(${serpapiImportRuns.query}) not like '%teste%'))`
      );
    }
    const rows = await db
      .select({
        id: serpapiImportRuns.id,
        status: serpapiImportRuns.status,
        initiatedByUserId: serpapiImportRuns.initiatedByUserId,
        cityId: serpapiImportRuns.cityId,
        nicheId: serpapiImportRuns.nicheId,
        query: serpapiImportRuns.query,
        paramsJson: serpapiImportRuns.paramsJson,
        dryRun: serpapiImportRuns.dryRun,
        foundCount: serpapiImportRuns.foundCount,
        insertedCount: serpapiImportRuns.insertedCount,
        updatedCount: serpapiImportRuns.updatedCount,
        conflictCount: serpapiImportRuns.conflictCount,
        errorCount: serpapiImportRuns.errorCount,
        dedupedCount: serpapiImportRuns.dedupedCount,
        createdAt: serpapiImportRuns.createdAt,
        finishedAt: serpapiImportRuns.finishedAt,
      })
      .from(serpapiImportRuns)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(serpapiImportRuns.createdAt))
      .limit(limit)
      .offset(offset);

    return rows ?? [];
  }

  async getRunRecordCounts(runId: string) {
    const [row] = await db
      .select({
        total: sql<number>`count(*)::int`,
        inserted: sql<number>`sum(case when ${serpapiImportRecords.status} = 'inserted' then 1 else 0 end)::int`,
        updated: sql<number>`sum(case when ${serpapiImportRecords.status} = 'updated' then 1 else 0 end)::int`,
        conflicts: sql<number>`sum(case when ${serpapiImportRecords.status} = 'conflict' then 1 else 0 end)::int`,
        errors: sql<number>`sum(case when ${serpapiImportRecords.status} = 'error' then 1 else 0 end)::int`,
      })
      .from(serpapiImportRecords)
      .where(eq(serpapiImportRecords.runId, runId))
      .limit(1);

    return {
      total: Number(row?.total ?? 0),
      inserted: Number(row?.inserted ?? 0),
      updated: Number(row?.updated ?? 0),
      conflicts: Number(row?.conflicts ?? 0),
      errors: Number(row?.errors ?? 0),
    };
  }

  async getRun(runId: string) {
    const [run] = await db
      .select({
        id: serpapiImportRuns.id,
        status: serpapiImportRuns.status,
        initiatedByUserId: serpapiImportRuns.initiatedByUserId,
        cityId: serpapiImportRuns.cityId,
        nicheId: serpapiImportRuns.nicheId,
        query: serpapiImportRuns.query,
        paramsJson: serpapiImportRuns.paramsJson,
        dryRun: serpapiImportRuns.dryRun,
        foundCount: serpapiImportRuns.foundCount,
        insertedCount: serpapiImportRuns.insertedCount,
        updatedCount: serpapiImportRuns.updatedCount,
        conflictCount: serpapiImportRuns.conflictCount,
        errorCount: serpapiImportRuns.errorCount,
        dedupedCount: serpapiImportRuns.dedupedCount,
        createdAt: serpapiImportRuns.createdAt,
        finishedAt: serpapiImportRuns.finishedAt,
      })
      .from(serpapiImportRuns)
      .where(eq(serpapiImportRuns.id, runId))
      .limit(1);

    return run ?? null;
  }

  async insertRecord(params: {
    runId: string;
    cityId?: string | null;
    nicheId?: string | null;
    dedupeKey: string | null;
    companyId: string | null;
    status: string;
    reason?: string | null;
    rawPayload: unknown;
    normalizedPayload?: Record<string, unknown> | null;
  }) {
    const [record] = await db
      .insert(serpapiImportRecords)
      .values({
        runId: params.runId,
        cityId: params.cityId ?? null,
        nicheId: params.nicheId ?? null,
        dedupeKey: params.dedupeKey,
        companyId: params.companyId,
        status: params.status,
        reason: params.reason ?? null,
        rawPayload: JSON.stringify(params.rawPayload),
        normalizedPayload: params.normalizedPayload ?? null,
      })
      .returning({
        id: serpapiImportRecords.id,
        status: serpapiImportRecords.status,
        companyId: serpapiImportRecords.companyId,
        dedupeKey: serpapiImportRecords.dedupeKey,
        reason: serpapiImportRecords.reason,
        createdAt: serpapiImportRecords.createdAt,
        rawPayload: serpapiImportRecords.rawPayload,
      });

    return record;
  }

  async insertRecords(
    records: Array<{
      runId: string;
      cityId?: string | null;
      nicheId?: string | null;
      dedupeKey: string | null;
      companyId: string | null;
      status: string;
      reason?: string | null;
      rawPayload: unknown;
      normalizedPayload?: Record<string, unknown> | null;
    }>
  ) {
    if (!records.length) {
      return;
    }

    await db.insert(serpapiImportRecords).values(
      records.map((record) => ({
        runId: record.runId,
        cityId: record.cityId ?? null,
        nicheId: record.nicheId ?? null,
        dedupeKey: record.dedupeKey,
        companyId: record.companyId,
        status: record.status,
        reason: record.reason ?? null,
        rawPayload: JSON.stringify(record.rawPayload),
        normalizedPayload: record.normalizedPayload ?? null,
      }))
    );
  }

  async listRecords(runId: string, options: { status?: string; limit: number; offset: number }) {
    const baseCondition = options.status
      ? and(
          eq(serpapiImportRecords.runId, runId),
          eq(serpapiImportRecords.status, options.status)
        )
      : eq(serpapiImportRecords.runId, runId);

    const query = db
      .select({
        id: serpapiImportRecords.id,
        status: serpapiImportRecords.status,
        companyId: serpapiImportRecords.companyId,
        dedupeKey: serpapiImportRecords.dedupeKey,
        reason: serpapiImportRecords.reason,
        createdAt: serpapiImportRecords.createdAt,
        rawPayload: serpapiImportRecords.rawPayload,
      })
      .from(serpapiImportRecords)
      .where(baseCondition);

    const totalRow = await db
      .select({
        count: sql`COUNT(*)::int`,
      })
      .from(serpapiImportRecords)
      .where(baseCondition);
    const total = (totalRow[0]?.count ?? 0) as number;

    const items = await query
      .orderBy(desc(serpapiImportRecords.createdAt))
      .limit(options.limit)
      .offset(options.offset);

    return { items, total };
  }

  async listRecordsForPublish(runId: string) {
    const rows = await db
      .select({
        id: serpapiImportRecords.id,
        rawPayload: serpapiImportRecords.rawPayload,
        normalizedPayload: serpapiImportRecords.normalizedPayload,
        dedupeKey: serpapiImportRecords.dedupeKey,
        companyId: serpapiImportRecords.companyId,
        status: serpapiImportRecords.status,
        cityId: serpapiImportRecords.cityId,
        nicheId: serpapiImportRecords.nicheId,
      })
      .from(serpapiImportRecords)
      .where(eq(serpapiImportRecords.runId, runId))
      .orderBy(desc(serpapiImportRecords.createdAt));

    return rows ?? [];
  }

  async listRecordsWithRuns(filters: {
    cityId?: string;
    nicheId?: string;
    createdAfter?: Date | null;
  }) {
    const conditions = [];
    if (filters.cityId) {
      conditions.push(eq(serpapiImportRuns.cityId, filters.cityId));
    }
    if (filters.nicheId) {
      conditions.push(eq(serpapiImportRuns.nicheId, filters.nicheId));
    }
    if (filters.createdAfter) {
      conditions.push(gte(serpapiImportRuns.createdAt, filters.createdAfter));
    }
    const whereClause = conditions.length ? and(...conditions) : undefined;

    const rows = await db
      .select({
        id: serpapiImportRecords.id,
        runId: serpapiImportRecords.runId,
        status: serpapiImportRecords.status,
        rawPayload: serpapiImportRecords.rawPayload,
        createdAt: serpapiImportRecords.createdAt,
        cityId: serpapiImportRuns.cityId,
        nicheId: serpapiImportRuns.nicheId,
        query: serpapiImportRuns.query,
        cityName: cities.name,
        cityState: cities.state,
        nicheName: niches.label,
      })
      .from(serpapiImportRecords)
      .innerJoin(serpapiImportRuns, eq(serpapiImportRecords.runId, serpapiImportRuns.id))
      .leftJoin(cities, eq(serpapiImportRuns.cityId, cities.id))
      .leftJoin(niches, eq(serpapiImportRuns.nicheId, niches.id))
      .where(whereClause)
      .orderBy(desc(serpapiImportRecords.createdAt));

    return rows ?? [];
  }

  async listCompaniesForExport(nicheId?: string) {
    const conditions = [eq(companies.source, "serpapi")];
    if (nicheId) {
      conditions.push(eq(companyNiches.nicheId, nicheId));
    }
    const rows = await db
      .select({
        companyId: companies.id,
        tradeName: companies.tradeName,
        address: companies.address,
        phone: companies.phone,
        whatsapp: companies.whatsapp,
        cityName: cities.name,
        cityState: cities.state,
        nicheName: niches.label,
        source: companies.source,
        createdAt: companies.createdAt,
      })
      .from(companies)
      .leftJoin(cities, eq(companies.cityId, cities.id))
      .leftJoin(companyNiches, eq(companyNiches.companyId, companies.id))
      .leftJoin(niches, eq(companyNiches.nicheId, niches.id))
      .where(and(...conditions))
      .orderBy(desc(companies.createdAt));

    return rows ?? [];
  }

  async getNicheById(nicheId: string) {
    const [row] = await db
      .select({ id: niches.id, name: niches.label })
      .from(niches)
      .where(eq(niches.id, nicheId))
      .limit(1);

    return row ?? null;
  }

  async listCompaniesByNiche(nicheId: string) {
    const rows = await db
      .select({
        id: companies.id,
        name: companies.tradeName,
        address: companies.address,
        phone: companies.phone,
        whatsapp: companies.whatsapp,
        hasWhatsapp: companies.hasWhatsapp,
        source: companies.source,
        createdAt: companies.createdAt,
        nicheName: niches.label,
      })
      .from(companyNiches)
      .innerJoin(companies, eq(companyNiches.companyId, companies.id))
      .innerJoin(niches, eq(companyNiches.nicheId, niches.id))
      .where(eq(companyNiches.nicheId, nicheId))
      .orderBy(desc(companies.createdAt));

    return rows ?? [];
  }

  async getLatestRunByNiche(nicheId: string) {
    const [row] = await db
      .select({
        id: serpapiImportRuns.id,
        cityId: serpapiImportRuns.cityId,
        nicheId: serpapiImportRuns.nicheId,
        query: serpapiImportRuns.query,
        foundCount: serpapiImportRuns.foundCount,
        dryRun: serpapiImportRuns.dryRun,
      })
      .from(serpapiImportRuns)
      .where(eq(serpapiImportRuns.nicheId, nicheId))
      .orderBy(desc(serpapiImportRuns.createdAt))
      .limit(1);

    return row ?? null;
  }

  async deleteNicheCompanies(nicheId: string) {
    const companyIds = await db
      .select({ companyId: companyNiches.companyId })
      .from(companyNiches)
      .where(eq(companyNiches.nicheId, nicheId));

    const ids = companyIds.map((row) => row.companyId);

    await db.delete(companyNiches).where(eq(companyNiches.nicheId, nicheId));

    if (ids.length) {
      const remaining = await db
        .select({ companyId: companyNiches.companyId })
        .from(companyNiches)
        .where(inArray(companyNiches.companyId, ids));
      const remainingSet = new Set(remaining.map((row) => row.companyId));
      const deleteIds = ids.filter((id) => !remainingSet.has(id));

      if (deleteIds.length) {
        await db
          .delete(companies)
          .where(and(inArray(companies.id, deleteIds), eq(companies.source, "serpapi")));
      }
    }

    const runIds = await db
      .select({ id: serpapiImportRuns.id })
      .from(serpapiImportRuns)
      .where(eq(serpapiImportRuns.nicheId, nicheId));
    const runIdList = runIds.map((row) => row.id);
    if (runIdList.length) {
      await db.delete(serpapiImportRecords).where(inArray(serpapiImportRecords.runId, runIdList));
      await db.delete(serpapiImportRuns).where(inArray(serpapiImportRuns.id, runIdList));
    }
  }

  async deleteNicheWithData(nicheId: string) {
    await this.deleteNicheCompanies(nicheId);
    await db.delete(auctionConfigs).where(eq(auctionConfigs.nicheId, nicheId));
    await db.delete(contactEvents).where(eq(contactEvents.nicheId, nicheId));
    await db.delete(productOffers).where(eq(productOffers.nicheId, nicheId));

    const searchRows = await db
      .select({ id: searches.id })
      .from(searches)
      .where(eq(searches.nicheId, nicheId));
    const searchIds = searchRows.map((row) => row.id);
    if (searchIds.length) {
      await db.delete(searchEvents).where(inArray(searchEvents.searchId, searchIds));
      await db.delete(searchResults).where(inArray(searchResults.searchId, searchIds));
      await db.delete(searches).where(inArray(searches.id, searchIds));
    }

    await db.delete(serpapiImportRecords).where(eq(serpapiImportRecords.nicheId, nicheId));
    await db.delete(niches).where(eq(niches.id, nicheId));
  }

  async deleteCompanyFromNiche(nicheId: string, companyId: string) {
    await db
      .delete(companyNiches)
      .where(and(eq(companyNiches.companyId, companyId), eq(companyNiches.nicheId, nicheId)));

    const remaining = await db
      .select({ companyId: companyNiches.companyId })
      .from(companyNiches)
      .where(eq(companyNiches.companyId, companyId));
    if (remaining.length === 0) {
      await db
        .delete(companies)
        .where(and(eq(companies.id, companyId), eq(companies.source, "serpapi")));
    }
  }

  async getRecordById(recordId: string) {
    const [record] = await db
      .select()
      .from(serpapiImportRecords)
      .where(eq(serpapiImportRecords.id, recordId))
      .limit(1);

    return record ?? null;
  }

  async updateRecordStatus(params: {
    recordId: string;
    status: string;
    companyId?: string | null;
    reason?: string | null;
  }) {
    await db
      .update(serpapiImportRecords)
      .set({
        status: params.status,
        companyId: params.companyId ?? null,
        reason: params.reason ?? null,
      })
      .where(eq(serpapiImportRecords.id, params.recordId));
  }

  async markRecordPublished(params: {
    recordId: string;
    companyId: string | null;
    publishedByUserId: string;
    publishStatus: string;
    status?: SerpapiRecordStatus;
  }) {
    await db
      .update(serpapiImportRecords)
      .set({
        companyId: params.companyId,
        status: params.status ?? undefined,
        publishStatus: params.publishStatus,
        publishedAt: new Date(),
        publishedByUserId: params.publishedByUserId,
      })
      .where(eq(serpapiImportRecords.id, params.recordId));
  }

  async findCompanyByNormalizedPhone(normalizedPhone: string) {
    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.normalizedPhone, normalizedPhone))
      .limit(1);
    return company ?? null;
  }

  async findCompanyByNameCity(normalizedName: string, cityId: string) {
    const [company] = await db
      .select()
      .from(companies)
      .where(and(eq(companies.normalizedName, normalizedName), eq(companies.cityId, cityId)))
      .limit(1);
    return company ?? null;
  }

  async insertCompany(payload: {
    ownerId: string;
    tradeName: string;
    cityId: string;
    phone?: string | null;
    whatsapp?: string | null;
    address?: string | null;
    normalizedPhone?: string | null;
    normalizedName?: string | null;
    sourceRef?: string | null;
    sourceRunId: string;
    status?: "draft" | "pending" | "active" | "suspended";
  }) {
    const [company] = await db
      .insert(companies)
      .values({
        ownerId: payload.ownerId,
        tradeName: payload.tradeName,
        cityId: payload.cityId,
        phone: payload.phone ?? null,
        whatsapp: payload.whatsapp ?? null,
        address: payload.address ?? null,
        normalizedPhone: payload.normalizedPhone ?? null,
        normalizedName: payload.normalizedName ?? null,
        source: "serpapi",
        sourceRef: payload.sourceRef ?? null,
        sourceRunId: payload.sourceRunId,
        created_from_import: true,
        status: payload.status ?? undefined,
      })
      .returning({ id: companies.id })
      ;

    return company?.id ?? null;
  }

  async updateCompany(companyId: string, updates: Partial<Record<string, unknown>>) {
    if (!Object.keys(updates).length) {
      return;
    }

    await db
      .update(companies)
      .set(updates)
      .where(eq(companies.id, companyId));
  }
}
