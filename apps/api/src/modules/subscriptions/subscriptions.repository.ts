import { and, desc, eq, inArray, isNotNull, lte } from "drizzle-orm";

import { db, type DatabaseClient } from "../../core/database/client";
import { productPlans } from "../products/products.schema";

import { paymentMethods, subscriptions } from "./subscriptions.schema";

type DbSession =
  | DatabaseClient
  | Parameters<Parameters<DatabaseClient["transaction"]>[0]>[0];

export type SubscriptionRecord = typeof subscriptions.$inferSelect;
export type PaymentMethodRecord = typeof paymentMethods.$inferSelect;
export type SubscriptionWithPlan = {
  subscription: SubscriptionRecord;
  plan: typeof productPlans.$inferSelect;
};

export class SubscriptionsRepository {
  constructor(private readonly database: DatabaseClient = db) {}

  async getCompanySubscription(companyId: string): Promise<SubscriptionWithPlan | undefined> {
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

  async listDueSubscriptions(now: Date): Promise<SubscriptionRecord[]> {
    return this.database
      .select()
      .from(subscriptions)
      .where(
        and(
          inArray(subscriptions.status, ["active", "past_due"]),
          lte(subscriptions.currentPeriodEnd, now)
        )
      );
  }

  async listPastDueWithGraceExpired(now: Date): Promise<SubscriptionRecord[]> {
    return this.database
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.status, "past_due"),
          isNotNull(subscriptions.graceUntil),
          lte(subscriptions.graceUntil, now)
        )
      );
  }

  async updateSubscription(
    subscriptionId: string,
    updates: Partial<typeof subscriptions.$inferInsert>,
    client: DbSession = this.database
  ): Promise<SubscriptionRecord | undefined> {
    const [row] = await client
      .update(subscriptions)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(subscriptions.id, subscriptionId))
      .returning();
    return row;
  }

  async getActivePaymentMethod(
    companyId: string,
    provider: PaymentMethodRecord["provider"]
  ): Promise<PaymentMethodRecord | undefined> {
    const [row] = await this.database
      .select()
      .from(paymentMethods)
      .where(
        and(
          eq(paymentMethods.companyId, companyId),
          eq(paymentMethods.provider, provider),
          eq(paymentMethods.status, "active")
        )
      )
      .orderBy(desc(paymentMethods.createdAt))
      .limit(1);
    return row;
  }

  async createPaymentMethod(
    params: Omit<PaymentMethodRecord, "id" | "createdAt" | "updatedAt">
  ): Promise<PaymentMethodRecord> {
    const [row] = await this.database
      .insert(paymentMethods)
      .values({
        ...params,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    return row;
  }

  async revokePaymentMethod(
    companyId: string,
    paymentMethodId: string
  ): Promise<PaymentMethodRecord | undefined> {
    const [row] = await this.database
      .update(paymentMethods)
      .set({ status: "revoked", updatedAt: new Date() })
      .where(and(eq(paymentMethods.companyId, companyId), eq(paymentMethods.id, paymentMethodId)))
      .returning();
    return row;
  }
}
