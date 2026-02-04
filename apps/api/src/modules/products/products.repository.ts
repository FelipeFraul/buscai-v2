import { and, count, desc, eq, gte, sql } from "drizzle-orm";

import { db, type DatabaseClient } from "../../core/database/client";
import { cities, niches } from "../catalog/catalog.schema";
import { companies } from "../companies/companies.schema";

import { productOffers, productPlans } from "./products.schema";
import { subscriptions } from "../subscriptions/subscriptions.schema";
import {
  getMinimumTokenMatches,
  normalizeColumnForSearch,
  normalizeForMatch,
  tokenizeSearch,
} from "../search/search-text";
import { ENV } from "../../config/env";

export type ProductPlanRecord = typeof productPlans.$inferSelect;
export type ProductOfferRecord = typeof productOffers.$inferSelect;
type ProductOfferInsert = typeof productOffers.$inferInsert;
type ProductOfferCreate = Omit<ProductOfferInsert, "companyId">;
type ProductOfferUpdate = Partial<{
  title: string;
  description: string;
  priceCents: number;
  originalPriceCents?: number | null;
  isActive: boolean;
  createdAt: Date;
}>;
type ProductSubscriptionRecord = typeof subscriptions.$inferSelect;

export type CompanySubscriptionWithPlan = {
  subscription: ProductSubscriptionRecord;
  plan: ProductPlanRecord;
};

export type ProductSearchRow = {
  offer: ProductOfferRecord;
  company: {
    id: string;
    tradeName: string;
    phone: string | null;
    address: string | null;
  };
  city: {
    id: string;
    name: string;
  };
};

export class ProductsRepository {
  constructor(private readonly database: DatabaseClient = db) {}

  async getActiveProductPlans(): Promise<ProductPlanRecord[]> {
    return this.database
      .select()
      .from(productPlans)
      .where(eq(productPlans.isActive, true))
      .orderBy(productPlans.monthlyPriceCents);
  }

  async findPlanById(planId: string): Promise<ProductPlanRecord | undefined> {
    const [plan] = await this.database
      .select()
      .from(productPlans)
      .where(eq(productPlans.id, planId))
      .limit(1);
    return plan;
  }

  async findCityById(cityId: string) {
    const [city] = await this.database
      .select()
      .from(cities)
      .where(eq(cities.id, cityId))
      .limit(1);
    return city;
  }

  async findNicheById(nicheId: string) {
    const [niche] = await this.database
      .select()
      .from(niches)
      .where(eq(niches.id, nicheId))
      .limit(1);
    return niche;
  }

  async getCompanySubscription(
    companyId: string
  ): Promise<CompanySubscriptionWithPlan | undefined> {
    const rows = await this.database
      .select({
        subscription: subscriptions,
        plan: productPlans,
      })
      .from(subscriptions)
      .innerJoin(productPlans, eq(productPlans.id, subscriptions.planId))
      .where(eq(subscriptions.companyId, companyId))
      .orderBy(desc(subscriptions.currentPeriodStart))
      .limit(1);

    return rows[0];
  }

  async setCompanySubscription(
    companyId: string,
    planId: string
  ): Promise<CompanySubscriptionWithPlan | undefined> {
    return this.database.transaction(async (tx) => {
      const now = new Date();
      const periodEnd = this.addMonthsPreserveDay(now, 1);

      const [existing] = await tx
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.companyId, companyId))
        .limit(1);

      let subscription: ProductSubscriptionRecord;
      if (existing) {
        [subscription] = await tx
          .update(subscriptions)
          .set({
            planId,
            status: "active",
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            graceUntil: null,
            scheduledPlanId: null,
            paymentMethod: null,
            updatedAt: now,
          })
          .where(eq(subscriptions.id, existing.id))
          .returning();
      } else {
        [subscription] = await tx
          .insert(subscriptions)
          .values({
            companyId,
            planId,
            status: "active",
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
          })
          .returning();
      }

      const [plan] = await tx
        .select()
        .from(productPlans)
        .where(eq(productPlans.id, planId))
        .limit(1);

      return plan
        ? { subscription, plan }
        : undefined;
    });
  }

  async schedulePlanChange(
    companyId: string,
    planId: string
  ): Promise<CompanySubscriptionWithPlan | undefined> {
    return this.database.transaction(async (tx) => {
      const [subscription] = await tx
        .update(subscriptions)
        .set({ scheduledPlanId: planId, updatedAt: new Date() })
        .where(eq(subscriptions.companyId, companyId))
        .returning();

      if (!subscription) {
        return undefined;
      }

      const [plan] = await tx
        .select()
        .from(productPlans)
        .where(eq(productPlans.id, subscription.planId))
        .limit(1);

      return plan ? { subscription, plan } : undefined;
    });
  }

  async countActiveOffersForCompany(companyId: string): Promise<number> {
    const [result] = await this.database
      .select({ value: count() })
      .from(productOffers)
      .where(and(eq(productOffers.companyId, companyId), eq(productOffers.isActive, true)));

    return Number(result?.value ?? 0);
  }

  async listProductOffersForCompany(
    companyId: string,
    page: number,
    pageSize: number
  ): Promise<{ items: ProductOfferRecord[]; total: number }> {
    const offset = (page - 1) * pageSize;

    const [total] = await this.database
      .select({ value: count() })
      .from(productOffers)
      .where(eq(productOffers.companyId, companyId));

    const items = await this.database
      .select()
      .from(productOffers)
      .where(eq(productOffers.companyId, companyId))
      .orderBy(desc(productOffers.createdAt))
      .offset(offset)
      .limit(pageSize);

    return {
      items,
      total: Number(total?.value ?? 0),
    };
  }

  async createProductOffer(
    companyId: string,
    data: ProductOfferCreate
  ): Promise<ProductOfferRecord> {
    const [offer] = await this.database
      .insert(productOffers)
      .values({ ...data, companyId })
      .returning();
    return offer;
  }

  async getProductOfferById(
    companyId: string,
    offerId: string
  ): Promise<ProductOfferRecord | undefined> {
    const [offer] = await this.database
      .select()
      .from(productOffers)
      .where(and(eq(productOffers.companyId, companyId), eq(productOffers.id, offerId)))
      .limit(1);
    return offer;
  }

  async updateProductOffer(
    companyId: string,
    offerId: string,
    data: ProductOfferUpdate
  ): Promise<ProductOfferRecord | undefined> {
    const [offer] = await this.database
      .update(productOffers)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(productOffers.companyId, companyId), eq(productOffers.id, offerId)))
      .returning();
    return offer;
  }

  async renewProductOffer(
    companyId: string,
    offerId: string,
    createdAt: Date
  ): Promise<ProductOfferRecord | undefined> {
    const [offer] = await this.database
      .update(productOffers)
      .set({ createdAt, updatedAt: new Date() })
      .where(and(eq(productOffers.companyId, companyId), eq(productOffers.id, offerId)))
      .returning();

    return offer;
  }

  async searchProductOffers(params: {
    cityId: string;
    nicheId?: string;
    query?: string;
    limit: number;
  }): Promise<{ items: ProductSearchRow[]; total: number }> {
    const tokens = params.query ? tokenizeSearch(params.query) : [];
    const normalizedTitle = normalizeColumnForSearch(productOffers.title);
    const normalizedDescription = normalizeColumnForSearch(productOffers.description);
    const matchCases =
      tokens.length > 0
        ? tokens.map(
            (token) =>
              sql<number>`case when ${normalizedTitle} like ${`%${token}%`} or ${normalizedDescription} like ${`%${token}%`} then 1 else 0 end`
          )
        : [];
    const prefixCases =
      tokens.length > 0
        ? tokens.map(
            (token) =>
              sql<number>`case when ${normalizedTitle} like ${`${token}%`} or ${normalizedDescription} like ${`${token}%`} then 1 else 0 end`
          )
        : [];
    const matchCountExpr =
      matchCases.length === 0
        ? sql<number>`0`
        : matchCases.length === 1
          ? matchCases[0]
          : sql<number>`(${sql.join(matchCases, sql` + `)})`;
    const prefixExpr =
      prefixCases.length === 0
        ? sql<number>`0`
        : prefixCases.length === 1
          ? prefixCases[0]
          : sql<number>`(${sql.join(prefixCases, sql` + `)})`;
    const normalizedQuery = params.query ? normalizeForMatch(params.query) : "";
    const trgmScore =
      ENV.SEARCH_USE_TRGM && normalizedQuery
        ? sql<number>`greatest(similarity(${normalizedTitle}, ${normalizedQuery}), similarity(${normalizedDescription}, ${normalizedQuery}))`
        : sql<number>`0`;
    const scoreExpr = sql<number>`(${matchCountExpr} + ${prefixExpr} + ${trgmScore})`;
    const minMatches = getMinimumTokenMatches(tokens.length);
    const buildSearchFilter = (requiredMatches: number) => {
      if (tokens.length === 0) {
        return undefined;
      }
      const base =
        tokens.length === 1
          ? sql`${normalizedTitle} like ${`%${tokens[0]}%`} or ${normalizedDescription} like ${`%${tokens[0]}%`}`
          : sql`${matchCountExpr} >= ${requiredMatches}`;
      if (ENV.SEARCH_USE_TRGM && normalizedQuery) {
        return sql`(${base}) or ${normalizedTitle} % ${normalizedQuery} or ${normalizedDescription} % ${normalizedQuery}`;
      }
      return base;
    };

    const runQuery = async (requiredMatches: number) => {
      const searchFilter = buildSearchFilter(requiredMatches);
      const filters = [
        eq(productOffers.cityId, params.cityId),
        eq(productOffers.isActive, true),
        eq(subscriptions.status, "active"),
        eq(companies.status, "active"),
        eq(productPlans.isActive, true),
        gte(
          productOffers.createdAt,
          new Date(Date.now() - 24 * 60 * 60 * 1000)
        ),
      ];

      if (params.nicheId) {
        filters.push(eq(productOffers.nicheId, params.nicheId));
      }

      if (searchFilter) {
        filters.push(searchFilter);
      }

      const whereClause = and(...filters);

      const items = await this.database
        .select({
          offer: productOffers,
          company: {
            id: companies.id,
            tradeName: companies.tradeName,
            phone: companies.phone,
            address: companies.address,
          },
          city: {
            id: cities.id,
            name: cities.name,
          },
        })
        .from(productOffers)
        .innerJoin(
          subscriptions,
          and(eq(subscriptions.companyId, productOffers.companyId), eq(subscriptions.status, "active"))
        )
        .innerJoin(productPlans, eq(productPlans.id, subscriptions.planId))
        .innerJoin(companies, eq(companies.id, productOffers.companyId))
        .innerJoin(cities, eq(cities.id, productOffers.cityId))
        .where(whereClause)
        .orderBy(productOffers.priceCents, desc(scoreExpr), productOffers.createdAt)
        .limit(params.limit);

      const [totalRow] = await this.database
        .select({ value: count() })
        .from(productOffers)
        .innerJoin(
          subscriptions,
          and(eq(subscriptions.companyId, productOffers.companyId), eq(subscriptions.status, "active"))
        )
        .innerJoin(productPlans, eq(productPlans.id, subscriptions.planId))
        .innerJoin(companies, eq(companies.id, productOffers.companyId))
        .where(whereClause);

      return {
        items,
        total: Number(totalRow?.value ?? 0),
      };
    };

    const primary = await runQuery(minMatches);
    if (tokens.length <= 1 || primary.items.length > 0) {
      return primary;
    }

    return runQuery(1);
  }

  private addMonthsPreserveDay(date: Date, months: number) {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const day = date.getUTCDate();
    const targetMonth = month + months;
    const lastDay = new Date(Date.UTC(year, targetMonth + 1, 0)).getUTCDate();
    const nextDay = Math.min(day, lastDay);
    return new Date(Date.UTC(year, targetMonth, nextDay, 0, 0, 0));
  }
}
