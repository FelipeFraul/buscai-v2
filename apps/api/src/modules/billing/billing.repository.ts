import { and, desc, eq, gte, lte, sql } from "drizzle-orm";

import { db, type DatabaseClient } from "../../core/database/client";

import { billingTransactions, billingWallets } from "./billing.schema";
import { searches } from "../search/search.schema";

export type BillingWalletRecord = typeof billingWallets.$inferSelect;
export type BillingTransactionRecord = typeof billingTransactions.$inferSelect;

type DateFilter = {
  from?: Date;
  to?: Date;
};

export type ReserveChargeParams = {
  companyId: string;
  amount: number;
  reason: string;
  metadata: {
    searchId: string;
    position: number;
  };
};

export type ReserveChargeResult =
  | { status: "reserved"; balance: number; transaction: BillingTransactionRecord }
  | { status: "insufficient_funds"; balance: number };

type DbSession =
  | DatabaseClient
  | Parameters<Parameters<DatabaseClient["transaction"]>[0]>[0];

export class BillingRepository {
  async getWalletByCompanyId(
    companyId: string,
    client: DbSession = db
  ): Promise<BillingWalletRecord | undefined> {
    const [wallet] = await client
      .select()
      .from(billingWallets)
      .where(eq(billingWallets.companyId, companyId))
      .limit(1);

    return wallet;
  }

  async getTransactionById(
    transactionId: string,
    client: DbSession = db
  ): Promise<BillingTransactionRecord | undefined> {
    const [row] = await client
      .select()
      .from(billingTransactions)
      .where(eq(billingTransactions.id, transactionId))
      .limit(1);

    return row;
  }

  async getWalletForUpdate(
    client: DbSession,
    companyId: string
  ): Promise<BillingWalletRecord | undefined> {
    const [wallet] = await client
      .select()
      .from(billingWallets)
      .where(eq(billingWallets.companyId, companyId))
      .limit(1)
      .for("update");

    return wallet;
  }

  async createWallet(
    client: DbSession,
    companyId: string
  ): Promise<BillingWalletRecord> {
    const [wallet] = await client
      .insert(billingWallets)
      .values({
        companyId,
        balance: "0",
        reserved: "0",
      })
      .returning();

    return wallet;
  }

  async insertTransaction(
    client: DbSession,
    data: typeof billingTransactions.$inferInsert
  ): Promise<BillingTransactionRecord> {
    const amountCents =
      data.amountCents ??
      (data.amount !== undefined && data.amount !== null
        ? Math.round(Number(data.amount))
        : 0);
    const [transaction] = await client
      .insert(billingTransactions)
      .values({
        ...data,
        amountCents,
      })
      .returning();

    return transaction;
  }

  async updateWalletBalance(
    client: DbSession,
    walletId: string,
    balance: number
  ): Promise<void> {
    await client
      .update(billingWallets)
      .set({ balance: balance.toString() })
      .where(eq(billingWallets.id, walletId));
  }

  async fetchTransactions(
    companyId: string,
    filter: DateFilter,
    options?: { limit?: number }
  ): Promise<BillingTransactionRecord[]> {
    const where = [eq(billingTransactions.companyId, companyId)];

    if (filter.from) {
      where.push(gte(billingTransactions.occurredAt, filter.from));
    }

    if (filter.to) {
      where.push(lte(billingTransactions.occurredAt, filter.to));
    }

    let query = db
      .select()
      .from(billingTransactions)
      .where(and(...where))
      .orderBy(desc(billingTransactions.occurredAt));

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    return query;
  }

  // Finance-only: do not use for auction operational metrics or daily pause gating.
  async sumSearchDebitByCompany(params: {
    companyId: string;
    from: Date;
    to: Date;
    cityId?: string;
    nicheId?: string;
  }): Promise<number> {
    const where = [
      eq(billingTransactions.companyId, params.companyId),
      eq(billingTransactions.type, "search_debit"),
      gte(billingTransactions.occurredAt, params.from),
      lte(billingTransactions.occurredAt, params.to),
    ];

    if (params.cityId && params.nicheId) {
      const searchIdExpr = sql`(${billingTransactions.reason}::jsonb ->> 'searchId')::uuid`;
      const rows = await db
        .select({ value: sql<number>`coalesce(sum(${billingTransactions.amountCents}), 0)` })
        .from(billingTransactions)
        .innerJoin(searches, eq(searches.id, searchIdExpr))
        .where(
          and(
            ...where,
            eq(searches.cityId, params.cityId),
            eq(searches.nicheId, params.nicheId)
          )
        );

      return Number(rows[0]?.value ?? 0);
    }

    const rows = await db
      .select({ value: sql<number>`coalesce(sum(${billingTransactions.amountCents}), 0)` })
      .from(billingTransactions)
      .where(and(...where));

    return Number(rows[0]?.value ?? 0);
  }

  async reserveSearchCharge(params: ReserveChargeParams): Promise<ReserveChargeResult> {
    return db.transaction(async (tx) => {
      let wallet = await this.getWalletForUpdate(tx, params.companyId);
      if (!wallet) {
        wallet = await this.createWallet(tx, params.companyId);
      }

      const balance = Number(wallet.balance ?? "0");
      if (balance < params.amount) {
        return {
          status: "insufficient_funds",
          balance,
        };
      }

      const updatedBalance = balance - params.amount;

      await this.updateWalletBalance(tx, wallet.id, updatedBalance);

      const transaction = await this.insertTransaction(tx, {
        companyId: params.companyId,
        type: "search_debit",
        amount: params.amount.toString(),
        status: "confirmed",
        reason: JSON.stringify({
          reason: params.reason,
          searchId: params.metadata.searchId,
          position: params.metadata.position,
        }),
      });

      return {
        status: "reserved",
        balance: updatedBalance,
        transaction,
      };
    });
  }

  async findSubscriptionTransaction(params: {
    subscriptionId: string;
    type: BillingTransactionRecord["type"];
    periodStart: Date;
    periodEnd: Date;
    status?: BillingTransactionRecord["status"];
  }): Promise<BillingTransactionRecord | undefined> {
    const [row] = await db
      .select()
      .from(billingTransactions)
      .where(
        and(
          eq(billingTransactions.subscriptionId, params.subscriptionId),
          eq(billingTransactions.type, params.type),
          eq(billingTransactions.periodStart, params.periodStart),
          eq(billingTransactions.periodEnd, params.periodEnd),
          params.status ? eq(billingTransactions.status, params.status) : undefined
        )
      )
      .limit(1);
    return row;
  }

  async createSubscriptionTransaction(params: {
    subscriptionId: string;
    companyId: string;
    type: BillingTransactionRecord["type"];
    status: BillingTransactionRecord["status"];
    amountCents: number;
    provider?: string | null;
    externalId?: string | null;
    periodStart: Date;
    periodEnd: Date;
    metadata?: Record<string, unknown>;
  }): Promise<BillingTransactionRecord> {
    return this.insertTransaction(db, {
      companyId: params.companyId,
      type: params.type,
      amount: params.amountCents.toString(),
      amountCents: params.amountCents,
      status: params.status,
      provider: params.provider ?? null,
      externalId: params.externalId ?? null,
      subscriptionId: params.subscriptionId,
      periodStart: params.periodStart,
      periodEnd: params.periodEnd,
      metadata: params.metadata ?? null,
    });
  }

  async chargeSubscriptionWithWallet(params: {
    subscriptionId: string;
    companyId: string;
    amountCents: number;
    periodStart: Date;
    periodEnd: Date;
    metadata?: Record<string, unknown>;
  }): Promise<{ status: "confirmed" | "failed"; balance: number }> {
    return db.transaction(async (tx) => {
      let wallet = await this.getWalletForUpdate(tx, params.companyId);
      if (!wallet) {
        wallet = await this.createWallet(tx, params.companyId);
      }

      const balance = Number(wallet.balance ?? "0");
      if (balance < params.amountCents) {
        await this.insertTransaction(tx, {
          companyId: params.companyId,
          type: "subscription_failed",
          amount: params.amountCents.toString(),
          amountCents: params.amountCents,
          status: "failed",
          subscriptionId: params.subscriptionId,
          periodStart: params.periodStart,
          periodEnd: params.periodEnd,
          metadata: params.metadata ?? null,
        });
        return { status: "failed", balance };
      }

      const nextBalance = balance - params.amountCents;
      await this.updateWalletBalance(tx, wallet.id, nextBalance);

      await this.insertTransaction(tx, {
        companyId: params.companyId,
        type: "subscription_renewal",
        amount: params.amountCents.toString(),
        amountCents: params.amountCents,
        status: "confirmed",
        subscriptionId: params.subscriptionId,
        periodStart: params.periodStart,
        periodEnd: params.periodEnd,
        metadata: params.metadata ?? null,
      });

      return { status: "confirmed", balance: nextBalance };
    });
  }

  async createRecharge(params: {
    companyId: string;
    amount: number;
    method?: string;
  }): Promise<BillingTransactionRecord> {
    return db.transaction(async (tx) => {
      let wallet = await this.getWalletForUpdate(tx, params.companyId);
      if (!wallet) {
        wallet = await this.createWallet(tx, params.companyId);
      }

      return this.insertTransaction(tx, {
        companyId: params.companyId,
        type: "recharge",
        amount: params.amount.toString(),
        status: "pending",
        reason: params.method ? `method:${params.method}` : null,
      });
    });
  }

  async confirmRecharge(rechargeId: string): Promise<{
    transaction: BillingTransactionRecord | null;
    balance: number | null;
  }> {
    return db.transaction(async (tx) => {
      const [recharge] = await tx
        .select()
        .from(billingTransactions)
        .where(eq(billingTransactions.id, rechargeId))
        .limit(1)
        .for("update");

      if (!recharge || recharge.type !== "recharge") {
        return { transaction: null, balance: null };
      }

      if (recharge.status === "pending") {
        let wallet = await this.getWalletForUpdate(tx, recharge.companyId);
        if (!wallet) {
          wallet = await this.createWallet(tx, recharge.companyId);
        }

        const nextBalance =
          Number(wallet.balance ?? "0") + Number(recharge.amount ?? "0");

        await this.updateWalletBalance(tx, wallet.id, nextBalance);
        await tx
          .update(billingTransactions)
          .set({ status: "confirmed" })
          .where(eq(billingTransactions.id, recharge.id));

        const [updated] = await tx
          .select()
          .from(billingTransactions)
          .where(eq(billingTransactions.id, recharge.id))
          .limit(1);

        return { transaction: updated ?? recharge, balance: nextBalance };
      }

      // Already confirmed or cancelled; do not change balance
      return { transaction: recharge, balance: null };
    });
  }
}
