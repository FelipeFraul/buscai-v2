import { randomUUID } from "crypto";

import {
  BillingRechargeIntentInputSchema,
  BillingTransactionsQuerySchema,
} from "@buscai/shared-schema";
import type { components } from "@buscai/shared-schema/src/api-types";
import { z } from "zod";

import { db, type DatabaseClient } from "../../core/database/client";
import { AppError } from "../../core/errors";
import { CompaniesRepository } from "../companies/companies.repository";
import { NotificationsService } from "../notifications/notifications.service";

import {
  BillingRepository,
  type BillingTransactionRecord,
  type ReserveChargeResult,
} from "./billing.repository";

type BillingTransactionsQuery = z.infer<typeof BillingTransactionsQuerySchema>;
type BillingRechargeIntentInput = z.infer<typeof BillingRechargeIntentInputSchema>;

type WalletDto = components["schemas"]["Wallet"];
type TransactionDto = components["schemas"]["Transaction"];
type RechargeIntentDto = components["schemas"]["RechargeIntent"];

export type BillingReserveResult = ReserveChargeResult;
export type SearchChargeCoverage = {
  ok: boolean;
  balance: number;
  reserved: number;
  available: number;
  walletExists: boolean;
  reason: "ok" | "no_wallet" | "insufficient_available";
};

type DbSession =
  | DatabaseClient
  | Parameters<Parameters<DatabaseClient["transaction"]>[0]>[0];

export class BillingService {
  constructor(
    private readonly billingRepository: BillingRepository,
    private readonly companiesRepository: CompaniesRepository,
    private readonly notificationsService?: NotificationsService
  ) {}

  async getWallet(
    actor: { userId: string; role: "admin" | "company_owner" },
    companyId: string
  ): Promise<WalletDto & { lastTransactions: TransactionDto[] }> {
    await this.ensureCompanyAccess(actor, companyId);

    const wallet = await this.billingRepository.getWalletByCompanyId(companyId);

    const ensured =
      wallet ?? (await this.billingRepository.createWallet(db, companyId));

    const lastTransactions = await this.billingRepository.fetchTransactions(
      companyId,
      {},
      { limit: 20 }
    );

    return {
      ...this.mapWalletToDto(ensured),
      lastTransactions: lastTransactions
        .sort((a, b) => (b.occurredAt?.getTime() ?? 0) - (a.occurredAt?.getTime() ?? 0))
        .map((transaction) => this.mapTransactionToDto(transaction)),
    };
  }

  async listTransactions(
    actor: { userId: string; role: "admin" | "company_owner" },
    query: BillingTransactionsQuery
  ): Promise<TransactionDto[]> {
    await this.ensureCompanyAccess(actor, query.companyId);

    const filters = {
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
    };

    const records = await this.billingRepository.fetchTransactions(
      query.companyId,
      filters
    );

    return records.map((transaction) => this.mapTransactionToDto(transaction));
  }

  async createRechargeIntent(
    actor: { userId: string; role: "admin" | "company_owner" },
    payload: BillingRechargeIntentInput
  ): Promise<RechargeIntentDto> {
    await this.ensureCompanyAccess(actor, payload.companyId);

    const transaction = await this.billingRepository.createRecharge({
      companyId: payload.companyId,
      amount: payload.amount,
      method: payload.method,
    });

    await this.notificationsService?.notifyEvent({
      companyId: payload.companyId,
      category: "financial",
      severity: "medium",
      kind: "event",
      title: "Recarga pendente",
      message: "Recarga aguardando confirmacao.",
      ctaLabel: "Ver recarga",
      ctaUrl: "/creditos",
      metadata: {
        amountCents: Math.round(payload.amount),
        rechargeId: transaction.id,
        status: transaction.status,
      },
    });

    return {
      id: transaction.id,
      amount: Number(transaction.amount ?? "0"),
      method: payload.method ?? "pix",
      status: transaction.status,
      createdAt: transaction.occurredAt?.toISOString(),
      fakePaymentInfo: {
        type: "pix",
        instructions: "Envie o comprovante para o suporte BUSCAI",
        reference: transaction.id.slice(0, 8).toUpperCase(),
      },
    };
  }

  async purchaseCredits(
    actor: { userId: string; role: "admin" | "company_owner" },
    companyId: string,
    payload: { amountCents: number; description?: string }
  ): Promise<{ success: true; balanceCents: number }> {
    await this.ensureCompanyAccess(actor, companyId);

    const amountCents = Math.round(payload.amountCents);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      throw new AppError(400, "invalid_amount");
    }

    const description =
      payload.description?.trim() || "Compra de créditos";

    const balanceCents = await db.transaction(async (tx) => {
      let wallet = await this.billingRepository.getWalletForUpdate(tx, companyId);
      if (!wallet) {
        wallet = await this.billingRepository.createWallet(tx, companyId);
      }

      const current = Number(wallet.balance ?? "0");
      const nextBalance = current + amountCents;

      await this.billingRepository.updateWalletBalance(tx, wallet.id, nextBalance);
      await this.billingRepository.insertTransaction(tx, {
        companyId,
        type: "credit",
        amount: amountCents.toString(),
        status: "confirmed",
        reason: description,
      });

      return nextBalance;
    });

    await this.notificationsService?.notifyEvent({
      companyId,
      category: "financial",
      severity: "low",
      kind: "event",
      title: "Recarga confirmada",
      message: `Voce recarregou R$ ${(amountCents / 100).toFixed(2)} com sucesso.`,
      ctaLabel: "Ver saldo",
      ctaUrl: "/creditos",
      metadata: {
        amountCents,
        balanceCents,
      },
    });

    return { success: true, balanceCents };
  }

  async confirmRecharge(
    actor: { userId: string; role: "admin" | "company_owner" },
    params: { rechargeId: string }
  ): Promise<{ rechargeId: string; status: string; amount: number; newBalance: number }> {
    const existing = await this.billingRepository.getTransactionById(
      params.rechargeId
    );
    if (!existing || existing.type !== "recharge") {
      throw new AppError(404, "recharge_not_found");
    }

    await this.ensureCompanyAccess(actor, existing.companyId);

    const { transaction, balance } = await this.billingRepository.confirmRecharge(
      params.rechargeId
    );

    if (!transaction) {
      throw new AppError(404, "recharge_not_found");
    }

    const wallet =
      balance !== null
        ? balance
        : Number(
            (
              await this.billingRepository.getWalletByCompanyId(transaction.companyId)
            )?.balance ?? "0"
          );

    await this.notificationsService?.notifyEvent({
      companyId: transaction.companyId,
      category: "financial",
      severity: transaction.status === "confirmed" ? "low" : "medium",
      kind: "event",
      title:
        transaction.status === "confirmed"
          ? "Recarga confirmada"
          : "Recarga pendente",
      message:
        transaction.status === "confirmed"
          ? `Voce recarregou R$ ${(Number(transaction.amount ?? "0") / 100).toFixed(
              2
            )} com sucesso.`
          : "Recarga aguardando confirmacao.",
      ctaLabel: "Ver saldo",
      ctaUrl: "/creditos",
      metadata: {
        rechargeId: transaction.id,
        amountCents: Math.round(Number(transaction.amount ?? "0")),
        balanceCents: Math.round(wallet),
        status: transaction.status,
      },
    });

    return {
      rechargeId: transaction.id,
      status: transaction.status,
      amount: Number(transaction.amount ?? "0"),
      newBalance: wallet,
    };
  }

  async getOrCreateWallet(
    actor: { userId: string; role: "admin" | "company_owner" },
    companyId: string
  ): Promise<WalletDto> {
    await this.ensureCompanyAccess(actor, companyId);

    const wallet = await this.billingRepository.getWalletByCompanyId(companyId);
    if (wallet) {
      return this.mapWalletToDto(wallet);
    }

    const created = await this.billingRepository.createWallet(db, companyId);
    return this.mapWalletToDto(created);
  }

  async reserveSearchCharge(params: {
    companyId: string;
    amount: number;
    searchId: string;
    position: number;
  }): Promise<ReserveChargeResult> {
    const result = await this.billingRepository.reserveSearchCharge({
      companyId: params.companyId,
      amount: params.amount,
      reason: "search_debit",
      metadata: {
        searchId: params.searchId,
        position: params.position,
      },
    });

    if (result.status === "reserved") {
      await this.notificationsService?.notifyEvent({
        companyId: params.companyId,
        category: "financial",
        severity: "low",
        kind: "event",
        title: "Debito por impressao",
        message: `Foi debitado R$ ${(params.amount / 100).toFixed(2)} por impressao (posicao ${params.position}).`,
        ctaLabel: "Ver gastos",
        ctaUrl: "/creditos",
        metadata: {
          searchId: params.searchId,
          position: params.position,
          amountCents: Math.round(params.amount),
          balanceCents: Math.round(result.balance),
          transactionId: result.transaction.id,
        },
      });

      await this.notificationsService?.notifyLowBalance({
        companyId: params.companyId,
        balanceCents: Math.round(result.balance),
      });
    } else {
      await this.notificationsService?.notifyEvent({
        companyId: params.companyId,
        category: "financial",
        severity: "high",
        kind: "alert",
        title: "Saldo insuficiente",
        message: "Voce parou de aparecer nos resultados pagos.",
        dedupeKey: "insufficient_funds",
        bucketDate: new Date().toISOString().slice(0, 10),
        ctaLabel: "Recarregar saldo",
        ctaUrl: "/creditos",
        metadata: {
          searchId: params.searchId,
          position: params.position,
          balanceCents: Math.round(result.balance),
        },
      });
    }

    return result;
  }

  async canCoverSearchCharge(params: {
    companyId: string;
    amount: number;
  }): Promise<boolean> {
    const coverage = await this.canCoverSearchChargeWithDebug(params);
    return coverage.ok;
  }

  async canCoverSearchChargeWithDebug(params: {
    companyId: string;
    amount: number;
  }): Promise<SearchChargeCoverage> {
    const wallet = await this.billingRepository.getWalletByCompanyId(params.companyId);
    if (!wallet) {
      return {
        ok: false,
        balance: 0,
        reserved: 0,
        available: 0,
        walletExists: false,
        reason: "no_wallet",
      };
    }
    const balance = Number(wallet.balance ?? "0");
    const reserved = Number(wallet.reserved ?? "0");
    const available = balance - reserved;
    const ok = available >= params.amount;
    return {
      ok,
      balance,
      reserved,
      available,
      walletExists: true,
      reason: ok ? "ok" : "insufficient_available",
    };
  }

  private mapWalletToDto(wallet: {
    balance: string | number | null;
    reserved: string | number | null;
  }): WalletDto {
    return {
      balance: Number(wallet.balance ?? "0"),
      reserved: Number(wallet.reserved ?? "0"),
      currency: "BRL",
    };
  }

  private mapTransactionToDto(transaction: BillingTransactionRecord): TransactionDto {
    const rawAmount = Number(transaction.amount ?? "0");
    const signedAmount =
      transaction.type === "search_debit" ? -Math.abs(rawAmount) : rawAmount;

    return {
      id: transaction.id,
      companyId: transaction.companyId,
      type: transaction.type as TransactionDto["type"],
      amount: signedAmount,
      amountCents: transaction.amountCents ?? undefined,
      status: (transaction as any).status ?? undefined,
      reason: transaction.reason ?? undefined,
      provider: (transaction as any).provider ?? undefined,
      externalId: (transaction as any).externalId ?? undefined,
      subscriptionId: (transaction as any).subscriptionId ?? undefined,
      periodStart: (transaction as any).periodStart?.toISOString?.() ?? undefined,
      periodEnd: (transaction as any).periodEnd?.toISOString?.() ?? undefined,
      metadata: (transaction as any).metadata ?? undefined,
      occurredAt: transaction.occurredAt?.toISOString(),
    } as TransactionDto;
  }

  private async ensureCompanyAccess(
    actor: { userId: string; role: "admin" | "company_owner" },
    companyId: string
  ): Promise<void> {
    if (actor.role === "admin") {
      return;
    }

    const company = await this.companiesRepository.getCompanyByIdForOwner(
      companyId,
      actor.userId
    );
    if (!company) {
      throw new AppError(403, "Forbidden");
    }
  }
}
