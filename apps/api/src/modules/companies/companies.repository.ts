import { and, asc, desc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";

import { db } from "../../core/database/client";
import { users } from "../auth/auth.schema";
import { cities, niches } from "../catalog/catalog.schema";

import { companies, companyNiches } from "./companies.schema";
import { ENV } from "../../config/env";
import {
  getMinimumTokenMatches,
  normalizeColumnForSearch,
  normalizeForMatch,
  tokenizeSearch,
} from "../search/search-text";

type CompanyRow = typeof companies.$inferSelect;
type CompanyInsert = typeof companies.$inferInsert;
type CityRow = typeof cities.$inferSelect;
type NicheRow = typeof niches.$inferSelect;

export type CompanyEntity = {
  company: CompanyRow;
  city: CityRow | null;
  niches: NicheRow[];
};

type CompanyChannelsUpdate = Partial<
  Pick<CompanyInsert, "address" | "phone" | "whatsapp" | "openingHours">
>;

type CreateCompanyInput = {
  ownerId: string;
  tradeName: string;
  legalName?: string | null;
  cityId: string;
  status?: CompanyRow["status"];
  qualityScore?: number;
  channels?: CompanyChannelsUpdate;
  nicheIds?: string[];
};

type UpdateCompanyInput = {
  tradeName?: string;
  legalName?: string | null;
  nicheIds?: string[];
};

type AdminCompaniesQuery = {
  cityId?: string;
  nicheId?: string;
  status?: CompanyRow["status"];
  q?: string;
  limit: number;
  offset: number;
};

type AdminCompanyPayload = {
  ownerId: string;
  createdByUserId?: string | null;
  tradeName: string;
  cityId: string;
  address?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  website?: string | null;
  normalizedPhone?: string | null;
  normalizedName?: string | null;
  lat?: string | null;
  lng?: string | null;
  status?: CompanyRow["status"];
  source?: CompanyRow["source"];
  qualityScore?: number;
  nicheId: string;
  participatesInAuction?: boolean;
  hasWhatsapp?: boolean;
};

type AdminCompanyUpdate = {
  tradeName?: string;
  cityId?: string;
  address?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  website?: string | null;
  normalizedPhone?: string | null;
  normalizedName?: string | null;
  lat?: string | null;
  lng?: string | null;
  status?: CompanyRow["status"];
  source?: CompanyRow["source"];
  qualityScore?: number;
  nicheId?: string;
  participatesInAuction?: boolean;
  hasWhatsapp?: boolean;
};

export class CompaniesRepository {
  async listCompaniesByOwner(ownerId: string): Promise<CompanyEntity[]> {
    const rows = await db
      .select({
        company: companies,
        city: cities,
      })
      .from(companies)
      .leftJoin(cities, eq(companies.cityId, cities.id))
      .where(eq(companies.ownerId, ownerId))
      .orderBy(desc(companies.createdAt));

    return this.attachNiches(rows);
  }

  async getLatestCompanyByOwner(ownerId: string): Promise<CompanyEntity | null> {
    const [row] = await db
      .select({
        company: companies,
        city: cities,
      })
      .from(companies)
      .leftJoin(cities, eq(companies.cityId, cities.id))
      .where(eq(companies.ownerId, ownerId))
      .orderBy(desc(companies.createdAt))
      .limit(1);

    if (!row) {
      return null;
    }

    const [entity] = await this.attachNiches([row]);
    return entity ?? null;
  }

  async searchCompaniesByName(params: {
    query: string;
    cityId?: string;
    excludeCompanyId?: string;
    limit?: number;
  }) {
    const limit = Math.max(1, Math.min(params.limit ?? 5, 20));
    const tokens = tokenizeSearch(params.query);
    if (tokens.length === 0) {
      return [];
    }

    const normalizedName = normalizeColumnForSearch(companies.tradeName);
    const matchCountCases = tokens.map(
      (token) => sql<number>`case when ${normalizedName} like ${`%${token}%`} then 1 else 0 end`
    );
    const prefixCases = tokens.map(
      (token) => sql<number>`case when ${normalizedName} like ${`${token}%`} then 1 else 0 end`
    );
    const matchCountExpr =
      matchCountCases.length === 1
        ? matchCountCases[0]
        : sql<number>`(${sql.join(matchCountCases, sql` + `)})`;
    const prefixExpr =
      prefixCases.length === 1
        ? prefixCases[0]
        : sql<number>`(${sql.join(prefixCases, sql` + `)})`;
    const normalizedQuery = normalizeForMatch(params.query);
    const trgmScore = ENV.SEARCH_USE_TRGM
      ? sql<number>`similarity(${normalizedName}, ${normalizedQuery})`
      : sql<number>`0`;
    const scoreExpr = sql<number>`(${matchCountExpr} + ${prefixExpr} + ${trgmScore})`;
    const minMatches = getMinimumTokenMatches(tokens.length);

    const runQuery = async (requiredMatches: number) => {
      const baseCondition =
        tokens.length === 1
          ? sql`${normalizedName} like ${`%${tokens[0]}%`}`
          : sql`${matchCountExpr} >= ${requiredMatches}`;
      const condition =
        ENV.SEARCH_USE_TRGM && normalizedQuery
          ? sql`(${baseCondition}) or ${normalizedName} % ${normalizedQuery}`
          : baseCondition;
      const conditions = [condition];

      if (params.cityId) {
        conditions.push(eq(companies.cityId, params.cityId));
      }

      if (params.excludeCompanyId) {
        conditions.push(ne(companies.id, params.excludeCompanyId));
      }

      return db
        .select({
          company: companies,
          city: cities,
        })
        .from(companies)
        .leftJoin(cities, eq(companies.cityId, cities.id))
        .where(and(...conditions))
        .orderBy(desc(scoreExpr), asc(companies.tradeName))
        .limit(limit);
    };

    const primary = await runQuery(minMatches);
    if (primary.length || tokens.length <= 1) {
      return primary;
    }

    return runQuery(1);
  }

  async searchCompaniesByNameWithNiches(params: {
    query: string;
    cityId?: string;
    excludeCompanyId?: string;
    limit?: number;
  }): Promise<CompanyEntity[]> {
    const rows = await this.searchCompaniesByName(params);
    return this.attachNiches(rows);
  }

  async getCompanyByIdForOwner(
    companyId: string,
    ownerId: string
  ): Promise<CompanyEntity | null> {
    const [row] = await db
      .select({
        company: companies,
        city: cities,
      })
      .from(companies)
      .leftJoin(cities, eq(companies.cityId, cities.id))
      .where(and(eq(companies.id, companyId), eq(companies.ownerId, ownerId)))
      .limit(1);

    if (!row) {
      return null;
    }

    const [entity] = await this.attachNiches([row]);
    return entity ?? null;
  }

  async findCompanyWithNiches(companyId: string): Promise<CompanyEntity | null> {
    const [row] = await db
      .select({
        company: companies,
        city: cities,
      })
      .from(companies)
      .leftJoin(cities, eq(companies.cityId, cities.id))
      .where(eq(companies.id, companyId))
      .limit(1);

    if (!row) {
      return null;
    }

    const [entity] = await this.attachNiches([row]);
    return entity ?? null;
  }

  async createCompanyForOwner(input: CreateCompanyInput): Promise<CompanyEntity> {
    const { nicheIds, channels, ...values } = input;

    const [created] = await db
      .insert(companies)
      .values({
        ownerId: values.ownerId,
        tradeName: values.tradeName,
        legalName: values.legalName ?? null,
        cityId: values.cityId,
        status: values.status ?? "pending",
        qualityScore: values.qualityScore ?? 50,
        address: channels?.address ?? null,
        phone: channels?.phone ?? null,
        whatsapp: channels?.whatsapp ?? null,
        openingHours: channels?.openingHours ?? null,
      })
      .returning({ id: companies.id });

    if (!created) {
      throw new Error("Failed to create company");
    }

    if (nicheIds?.length) {
      await this.replaceCompanyNiches(created.id, nicheIds);
    }

    const entity = await this.getCompanyByIdForOwner(
      created.id,
      values.ownerId
    );

    if (!entity) {
      throw new Error("Failed to load company after creation");
    }

    return entity;
  }

  async updateCompanyForOwner(
    companyId: string,
    ownerId: string,
    input: UpdateCompanyInput
  ): Promise<CompanyEntity | null> {
    const updatePayload: Partial<CompanyInsert> = {};

    if (typeof input.tradeName === "string") {
      updatePayload.tradeName = input.tradeName;
    }

    if (typeof input.legalName === "string") {
      updatePayload.legalName = input.legalName;
    }

    if (Object.keys(updatePayload).length > 0) {
      await db
        .update(companies)
        .set({ ...updatePayload, updatedAt: new Date() })
        .where(and(eq(companies.id, companyId), eq(companies.ownerId, ownerId)));
    }

    if (input.nicheIds) {
      await this.replaceCompanyNiches(companyId, input.nicheIds);
    }

    return this.getCompanyByIdForOwner(companyId, ownerId);
  }

  async updateCompanyChannels(
    companyId: string,
    channels: CompanyChannelsUpdate
  ): Promise<boolean> {
    const updatePayload: Partial<CompanyInsert> = {
      updatedAt: new Date(),
    };

    if (channels.address !== undefined) updatePayload.address = channels.address ?? null;
    if (channels.phone !== undefined) updatePayload.phone = channels.phone ?? null;
    if (channels.whatsapp !== undefined) updatePayload.whatsapp = channels.whatsapp ?? null;
    if (channels.openingHours !== undefined) updatePayload.openingHours = channels.openingHours ?? null;

    if (Object.keys(updatePayload).length === 1) {
      return true;
    }

    const rows = await db
      .update(companies)
      .set(updatePayload)
      .where(eq(companies.id, companyId))
      .returning({ id: companies.id });

    return rows.length > 0;
  }

  async updateCompanyQualityScore(companyId: string, qualityScore: number): Promise<void> {
    await db
      .update(companies)
      .set({ qualityScore, updatedAt: new Date() })
      .where(eq(companies.id, companyId));
  }

  async listAdminCompanies(query: AdminCompaniesQuery) {
    const conditions = [];
    if (query.cityId) {
      conditions.push(eq(companies.cityId, query.cityId));
    }
    if (query.status) {
      conditions.push(eq(companies.status, query.status));
    }
    if (query.q) {
      const term = `%${query.q}%`;
      conditions.push(
        or(
          ilike(companies.tradeName, term),
          ilike(companies.address, term),
          ilike(companies.phone, term),
          ilike(companies.whatsapp, term)
        )
      );
    }
    if (query.nicheId) {
      conditions.push(
        sql`exists (select 1 from company_niches cn where cn.company_id = ${companies.id} and cn.niche_id = ${query.nicheId})`
      );
    }

    const whereClause = conditions.length ? and(...conditions) : undefined;

    const rows = await db
      .select({
        id: companies.id,
        tradeName: companies.tradeName,
        cityId: companies.cityId,
        address: companies.address,
        phone: companies.phone,
        whatsapp: companies.whatsapp,
        website: companies.website,
        lat: companies.lat,
        lng: companies.lng,
        status: companies.status,
        participatesInAuction: companies.participatesInAuction,
        hasWhatsapp: companies.hasWhatsapp,
        source: companies.source,
        qualityScore: companies.qualityScore,
        createdAt: companies.createdAt,
        updatedAt: companies.updatedAt,
        nicheId: sql<string | null>`(select niche_id from company_niches cn where cn.company_id = ${companies.id} limit 1)`,
      })
      .from(companies)
      .where(whereClause)
      .orderBy(desc(companies.createdAt))
      .limit(query.limit)
      .offset(query.offset);

    const totalRow = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(companies)
      .where(whereClause);

    const total = (totalRow[0]?.count ?? 0) as number;

    return { items: rows, total };
  }

  async getAdminCompanyById(companyId: string) {
    const [row] = await db
      .select({
        id: companies.id,
        tradeName: companies.tradeName,
        cityId: companies.cityId,
        address: companies.address,
        phone: companies.phone,
        whatsapp: companies.whatsapp,
        website: companies.website,
        lat: companies.lat,
        lng: companies.lng,
        status: companies.status,
        participatesInAuction: companies.participatesInAuction,
        hasWhatsapp: companies.hasWhatsapp,
        source: companies.source,
        qualityScore: companies.qualityScore,
        createdAt: companies.createdAt,
        updatedAt: companies.updatedAt,
        nicheId: sql<string | null>`(select niche_id from company_niches cn where cn.company_id = ${companies.id} limit 1)`,
      })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    return row ?? null;
  }

  async createAdminCompany(payload: AdminCompanyPayload) {
    const [created] = await db
      .insert(companies)
      .values({
        ownerId: payload.ownerId,
        createdByUserId: payload.createdByUserId ?? null,
        tradeName: payload.tradeName,
        cityId: payload.cityId,
        address: payload.address ?? null,
        phone: payload.phone ?? null,
        whatsapp: payload.whatsapp ?? null,
        website: payload.website ?? null,
        normalizedPhone: payload.normalizedPhone ?? null,
        normalizedName: payload.normalizedName ?? null,
        lat: payload.lat ?? null,
        lng: payload.lng ?? null,
        status: payload.status ?? "pending",
        participatesInAuction: payload.participatesInAuction ?? false,
        hasWhatsapp: payload.hasWhatsapp ?? false,
        source: payload.source ?? "manual",
        qualityScore: payload.qualityScore ?? 50,
      })
      .returning({ id: companies.id });

    if (!created) {
      throw new Error("Failed to create company");
    }

    await this.replaceCompanyNiches(created.id, [payload.nicheId]);

    return this.getAdminCompanyById(created.id);
  }

  async updateAdminCompany(companyId: string, payload: AdminCompanyUpdate) {
    const updatePayload: Partial<CompanyInsert> = {
      updatedAt: new Date(),
    };

    if (typeof payload.tradeName === "string") updatePayload.tradeName = payload.tradeName;
    if (typeof payload.cityId === "string") updatePayload.cityId = payload.cityId;
    if (payload.address !== undefined) updatePayload.address = payload.address;
    if (payload.phone !== undefined) updatePayload.phone = payload.phone;
    if (payload.whatsapp !== undefined) updatePayload.whatsapp = payload.whatsapp;
    if (payload.website !== undefined) updatePayload.website = payload.website;
    if (payload.normalizedPhone !== undefined) updatePayload.normalizedPhone = payload.normalizedPhone;
    if (payload.normalizedName !== undefined) updatePayload.normalizedName = payload.normalizedName;
    if (payload.lat !== undefined) updatePayload.lat = payload.lat;
    if (payload.lng !== undefined) updatePayload.lng = payload.lng;
    if (payload.status) updatePayload.status = payload.status;
    if (payload.source) updatePayload.source = payload.source;
    if (typeof payload.qualityScore === "number") updatePayload.qualityScore = payload.qualityScore;
    if (payload.participatesInAuction !== undefined) {
      updatePayload.participatesInAuction = payload.participatesInAuction;
    }
    if (payload.hasWhatsapp !== undefined) {
      updatePayload.hasWhatsapp = payload.hasWhatsapp;
    }

    await db.update(companies).set(updatePayload).where(eq(companies.id, companyId));

    if (payload.nicheId) {
      await this.replaceCompanyNiches(companyId, [payload.nicheId]);
    }

    return this.getAdminCompanyById(companyId);
  }

  async updateAdminCompanyStatus(companyId: string, status: CompanyRow["status"]) {
    await db
      .update(companies)
      .set({ status, updatedAt: new Date() })
      .where(eq(companies.id, companyId));
  }

  async findDuplicatesByContact(params: {
    phoneDigits?: string | null;
    whatsappDigits?: string | null;
    website?: string | null;
  }) {
    const conditions = [];

    if (params.phoneDigits) {
      conditions.push(
        sql`regexp_replace(coalesce(${companies.phone}, ''), '\\D', '', 'g') = ${params.phoneDigits}`
      );
    }
    if (params.whatsappDigits) {
      conditions.push(
        sql`regexp_replace(coalesce(${companies.whatsapp}, ''), '\\D', '', 'g') = ${params.whatsappDigits}`
      );
    }
    if (params.website) {
      conditions.push(sql`lower(coalesce(${companies.website}, '')) = ${params.website.toLowerCase()}`);
    }

    if (!conditions.length) {
      return [];
    }

    return db
      .select({
        id: companies.id,
        tradeName: companies.tradeName,
        phone: companies.phone,
        whatsapp: companies.whatsapp,
        website: companies.website,
        status: companies.status,
        cityId: companies.cityId,
      })
      .from(companies)
      .where(or(...conditions))
      .limit(25);
  }

  async findCityById(cityId: string): Promise<CityRow | null> {
    const [city] = await db
      .select()
      .from(cities)
      .where(eq(cities.id, cityId))
      .limit(1);

    return city ?? null;
  }

  async findNichesByIds(nicheIds: string[]): Promise<NicheRow[]> {
    if (nicheIds.length === 0) {
      return [];
    }

    return db
      .select()
      .from(niches)
      .where(inArray(niches.id, nicheIds));
  }

  async listAllNiches(): Promise<NicheRow[]> {
    return db.select().from(niches);
  }

  async getCompanyOwnerId(companyId: string): Promise<string | null> {
    const [row] = await db
      .select({ ownerId: companies.ownerId })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    return row?.ownerId ?? null;
  }

  async ownerExists(ownerId: string): Promise<boolean> {
    const [owner] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, ownerId))
      .limit(1);

    return Boolean(owner);
  }

  private async replaceCompanyNiches(
    companyId: string,
    nicheIds: string[]
  ): Promise<void> {
    const uniqueIds = Array.from(new Set(nicheIds));

    await db
      .delete(companyNiches)
      .where(eq(companyNiches.companyId, companyId));

    if (uniqueIds.length === 0) {
      return;
    }

    await db.insert(companyNiches).values(
      uniqueIds.map((nicheId) => ({
        companyId,
        nicheId,
      }))
    );
  }

  private async attachNiches(
    rows: Array<{ company: CompanyRow; city: CityRow | null }>
  ): Promise<CompanyEntity[]> {
    if (rows.length === 0) {
      return [];
    }

    const companyIds = rows.map((row) => row.company.id);
    const nicheRows = await db
      .select({
        companyId: companyNiches.companyId,
        niche: niches,
      })
      .from(companyNiches)
      .innerJoin(niches, eq(companyNiches.nicheId, niches.id))
      .where(inArray(companyNiches.companyId, companyIds));

    const nicheMap = new Map<string, NicheRow[]>();
    nicheRows.forEach((row) => {
      const current = nicheMap.get(row.companyId) ?? [];
      current.push(row.niche);
      nicheMap.set(row.companyId, current);
    });

    return rows.map((row) => ({
      company: row.company,
      city: row.city,
      niches: nicheMap.get(row.company.id) ?? [],
    }));
  }
}
