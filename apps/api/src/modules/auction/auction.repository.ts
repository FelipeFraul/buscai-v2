import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { db, type DatabaseClient } from "../../core/database/client";
import { companies, companyNiches } from "../companies/companies.schema";

import { auctionConfigs } from "./auction.schema";

type AuctionConfigRecord = typeof auctionConfigs.$inferSelect;
type AuctionConfigInsert = typeof auctionConfigs.$inferInsert;
type CompanyRecord = typeof companies.$inferSelect;

export type AuctionConfigWithCompany = {
  config: AuctionConfigRecord;
  company: CompanyRecord;
};

export class AuctionRepository {
  private phoneOrWhatsappCondition() {
    return sql`((${companies.phone} is not null and ${companies.phone} <> '') or (${companies.whatsapp} is not null and ${companies.whatsapp} <> ''))`;
  }

  async listConfigs(filters: {
    cityId?: string;
    nicheId?: string;
    companyId?: string;
  }): Promise<AuctionConfigRecord[]> {
    const where = [];

    if (filters.cityId) {
      where.push(eq(auctionConfigs.cityId, filters.cityId));
    }

    if (filters.nicheId) {
      where.push(eq(auctionConfigs.nicheId, filters.nicheId));
    }

    if (filters.companyId) {
      where.push(eq(auctionConfigs.companyId, filters.companyId));
    }

    if (where.length === 0) {
      return db.select().from(auctionConfigs);
    }

    return db.select().from(auctionConfigs).where(and(...where));
  }

  async upsertConfig(
    payload: AuctionConfigInsert,
    client: DatabaseClient = db
  ): Promise<AuctionConfigRecord> {
    if (payload.id) {
      const [existing] =
        (await client
          .select()
          .from(auctionConfigs)
          .where(eq(auctionConfigs.id, payload.id))
          .limit(1)) ?? [];

      if (existing) {
        const [updated] = await client
          .update(auctionConfigs)
          .set({
            mode: payload.mode ?? existing.mode,
            bidPosition1: payload.bidPosition1 ?? existing.bidPosition1,
            bidPosition2: payload.bidPosition2 ?? existing.bidPosition2,
            bidPosition3: payload.bidPosition3 ?? existing.bidPosition3,
            targetPosition: payload.targetPosition ?? existing.targetPosition,
            targetShare: payload.targetShare ?? existing.targetShare,
            dailyBudget: payload.dailyBudget ?? existing.dailyBudget,
            pauseOnLimit:
              typeof payload.pauseOnLimit === "boolean"
                ? payload.pauseOnLimit
                : existing.pauseOnLimit,
            isActive:
              typeof payload.isActive === "boolean" ? payload.isActive : existing.isActive,
            cityId: payload.cityId ?? existing.cityId,
            nicheId: payload.nicheId ?? existing.nicheId,
            companyId: payload.companyId ?? existing.companyId,
          })
          .where(eq(auctionConfigs.id, existing.id))
          .returning();

        return updated;
      }
    }

    const [inserted] = await client.insert(auctionConfigs).values(payload).returning();
    return inserted;
  }

  async findActiveConfigsForSearch(cityId: string, nicheId: string): Promise<
    AuctionConfigWithCompany[]
  > {
    return db
      .select({
        config: auctionConfigs,
        company: companies,
      })
      .from(auctionConfigs)
      .innerJoin(companies, eq(companies.id, auctionConfigs.companyId))
      .where(
        and(
          eq(auctionConfigs.cityId, cityId),
          eq(auctionConfigs.nicheId, nicheId),
          eq(auctionConfigs.isActive, true),
          eq(companies.status, "active"),
          eq(companies.cityId, cityId),
          this.phoneOrWhatsappCondition()
        )
      );
  }

  async findOrganicCompanies(
    cityId: string,
    nicheId: string
  ): Promise<CompanyRecord[]> {
    return db
      .select()
      .from(companies)
      .innerJoin(
        companyNiches,
        and(
          eq(companyNiches.companyId, companies.id),
          eq(companyNiches.nicheId, nicheId)
        )
      )
      .leftJoin(
        auctionConfigs,
        and(
          eq(auctionConfigs.companyId, companies.id),
          eq(auctionConfigs.cityId, cityId),
          eq(auctionConfigs.nicheId, nicheId),
          eq(auctionConfigs.isActive, true)
        )
      )
      .where(
        and(
          eq(companies.cityId, cityId),
          inArray(companies.status, ["active", "pending"]),
          this.phoneOrWhatsappCondition(),
          sql`${auctionConfigs.id} is null`
        )
      )
      .orderBy(asc(companies.createdAt))
      .then((rows) => rows.map((row) => row.companies));
  }

  async countConfigsByCompany(companyId: string): Promise<number> {
    const [row] = await db
      .select({ value: sql<string>`count(*)` })
      .from(auctionConfigs)
      .where(eq(auctionConfigs.companyId, companyId));
    return Number(row?.value ?? 0);
  }
}
