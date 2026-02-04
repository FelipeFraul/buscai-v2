import { and, eq, gte, lt, sql } from "drizzle-orm";

import { db } from "../../core/database/client";
import { billingTransactions } from "../billing/billing.schema";
import { contactEvents } from "../contacts/contact.schema";
import { searchEvents } from "../search/search.schema";

import {
  NotificationsRepository,
  type NotificationCategory,
  type NotificationInsert,
  type NotificationKind,
  type NotificationPreferencesRow,
  type NotificationPreferencesUpdate,
  type NotificationSeverity,
} from "./notifications.repository";

const LOW_BALANCE_THRESHOLD_CENTS = 2000;

export type NotificationListQuery = {
  category?: NotificationCategory;
  severity?: NotificationSeverity;
  kind?: NotificationKind;
  unreadOnly?: boolean;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
};

export class NotificationsService {
  constructor(private readonly repository: NotificationsRepository) {}

  async getPreferences(companyId: string) {
    const existing = await this.repository.getPreferences(companyId);
    if (existing) {
      return existing;
    }
    return this.repository.createDefaultPreferences(companyId);
  }

  async updatePreferences(companyId: string, update: NotificationPreferencesUpdate) {
    await this.repository.createDefaultPreferences(companyId);
    return this.repository.updatePreferences(companyId, update);
  }

  async listNotifications(companyId: string, query: NotificationListQuery) {
    const preferences = await this.getPreferences(companyId);
    await this.maybeGenerateSummaries(companyId, preferences);
    await this.maybeGenerateVisibilityAlerts(companyId, preferences);

    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const offset = Math.max(query.offset ?? 0, 0);

    const items = await this.repository.listNotifications({
      companyId,
      category: query.category,
      severity: query.severity,
      kind: query.kind,
      unreadOnly: query.unreadOnly,
      from: query.from,
      to: query.to,
      limit,
      offset,
    });

    const nextOffset = items.length === limit ? offset + limit : null;

    return { items, nextOffset };
  }

  async markRead(companyId: string, ids: string[]) {
    return this.repository.markRead(companyId, ids);
  }

  async notifyEvent(params: NotificationInsert) {
    const preferences = await this.getPreferences(params.companyId);

    if (!this.shouldCreate(preferences, params.category, params.severity)) {
      return null;
    }

    if (preferences.frequency !== "real_time" && params.kind === "event") {
      return null;
    }

    return this.repository.insertNotification(params);
  }

  async notifyLowBalance(params: { companyId: string; balanceCents: number }) {
    if (params.balanceCents <= 0) {
      return this.notifyEvent({
        companyId: params.companyId,
        category: "financial",
        severity: "high",
        kind: "alert",
        title: "Saldo zerou",
        message: "Você deixou de aparecer nos resultados pagos.",
        dedupeKey: "balance_zero",
        bucketDate: this.formatBucketDate(new Date()),
        ctaLabel: "Recarregar saldo",
        ctaUrl: "/creditos",
        metadata: { balanceCents: params.balanceCents },
      });
    }

    if (params.balanceCents <= LOW_BALANCE_THRESHOLD_CENTS) {
      return this.notifyEvent({
        companyId: params.companyId,
        category: "financial",
        severity: "high",
        kind: "alert",
        title: "Saldo baixo",
        message: `Seu saldo ficou abaixo de R$ ${(LOW_BALANCE_THRESHOLD_CENTS / 100).toFixed(2)}.`,
        dedupeKey: "balance_low",
        bucketDate: this.formatBucketDate(new Date()),
        ctaLabel: "Recarregar saldo",
        ctaUrl: "/creditos",
        metadata: { balanceCents: params.balanceCents },
      });
    }

    return null;
  }

  private shouldCreate(
    preferences: NotificationPreferencesRow,
    category: NotificationCategory,
    severity: NotificationSeverity
  ) {
    if (!preferences.panelEnabled) {
      return false;
    }

    const categoryAllowed = {
      financial: preferences.financialEnabled,
      visibility: preferences.visibilityEnabled,
      subscription: preferences.subscriptionEnabled,
      contacts: preferences.contactsEnabled,
      system: preferences.systemEnabled,
    }[category];

    if (!categoryAllowed) {
      return false;
    }

    if (preferences.frequency === "never" && severity !== "high") {
      return false;
    }

    return true;
  }

  private async maybeGenerateSummaries(
    companyId: string,
    preferences: NotificationPreferencesRow
  ) {
    if (!preferences.panelEnabled) {
      return;
    }

    if (!preferences.visibilityEnabled) {
      return;
    }

    if (preferences.frequency === "daily") {
      await this.generateDailySummary(companyId);
      return;
    }

    if (preferences.frequency === "weekly") {
      await this.generateWeeklySummary(companyId);
    }
  }

  private async maybeGenerateVisibilityAlerts(
    companyId: string,
    preferences: NotificationPreferencesRow
  ) {
    if (!preferences.panelEnabled || !preferences.visibilityEnabled) {
      return;
    }

    const now = new Date();
    const lastDay = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [{ impressions = 0 } = {}] =
      (await db
        .select({
          impressions: sql<number>`count(*)`,
        })
        .from(searchEvents)
        .where(
          and(
            eq(searchEvents.companyId, companyId),
            eq(searchEvents.type, "impression"),
            gte(searchEvents.createdAt, lastDay)
          )
        )) ?? [];

    if (impressions === 0) {
      await this.repository.insertNotification({
        companyId,
        category: "visibility",
        severity: "high",
        kind: "alert",
        title: "Zero impressao nas ultimas 24h",
        message: "Pode ser lance baixo ou baixa demanda.",
        dedupeKey: "zero_impressions_24h",
        bucketDate: this.formatBucketDate(now),
        ctaLabel: "Ver performance",
        ctaUrl: "/leilao",
        metadata: { impressions },
      });
    }
  }

  private async generateDailySummary(companyId: string) {
    const now = new Date();
    if (now.getHours() < 19) {
      return;
    }

    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);

    const bucketDate = this.formatBucketDate(now);

    const summary = await this.buildSummary(companyId, start, end);

    if (!summary) {
      return;
    }

    await this.repository.insertNotification({
      companyId,
      category: "visibility",
      severity: "low",
      kind: "summary",
      title: "Resumo diario",
      message: summary.message,
      reason: summary.reason,
      dedupeKey: "daily_summary",
      bucketDate,
      ctaLabel: "Ver performance",
      ctaUrl: "/leilao",
      metadata: summary.metadata,
    });
  }

  private async generateWeeklySummary(companyId: string) {
    const now = new Date();
    if (now.getDay() !== 1 || now.getHours() < 9) {
      return;
    }

    const start = new Date(now);
    const diff = (now.getDay() + 6) % 7;
    start.setDate(now.getDate() - diff);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);

    const bucketDate = this.formatBucketDate(start);

    const summary = await this.buildSummary(companyId, start, end);
    if (!summary) {
      return;
    }

    await this.repository.insertNotification({
      companyId,
      category: "visibility",
      severity: "low",
      kind: "summary",
      title: "Resumo semanal",
      message: summary.message,
      reason: summary.reason,
      dedupeKey: "weekly_summary",
      bucketDate,
      ctaLabel: "Ver performance",
      ctaUrl: "/leilao",
      metadata: summary.metadata,
    });
  }

  private async buildSummary(
    companyId: string,
    start: Date,
    end: Date
  ): Promise<{
    message: string;
    reason: string;
    metadata: Record<string, number>;
  } | null> {
    const [{ impressions = 0 } = {}] =
      (await db
        .select({
          impressions: sql<number>`count(*)`,
        })
        .from(searchEvents)
        .where(
          and(
            eq(searchEvents.companyId, companyId),
            eq(searchEvents.type, "impression"),
            gte(searchEvents.createdAt, start),
            lt(searchEvents.createdAt, end)
          )
        )) ?? [];

    const [{ paidImpressions = 0 } = {}] =
      (await db
        .select({
          paidImpressions: sql<number>`count(*)`,
        })
        .from(searchEvents)
        .where(
          and(
            eq(searchEvents.companyId, companyId),
            eq(searchEvents.type, "impression"),
            gte(searchEvents.createdAt, start),
            lt(searchEvents.createdAt, end),
            sql`${searchEvents.meta} ->> 'amount' is not null`
          )
        )) ?? [];

    const [{ clicks = 0, whatsappClicks = 0, callClicks = 0 } = {}] =
      (await db
        .select({
          clicks: sql<number>`count(*)`,
          whatsappClicks: sql<number>`sum(case when ${searchEvents.type} = 'click_whatsapp' then 1 else 0 end)`,
          callClicks: sql<number>`sum(case when ${searchEvents.type} = 'click_call' then 1 else 0 end)`,
        })
        .from(searchEvents)
        .where(
          and(
            eq(searchEvents.companyId, companyId),
            gte(searchEvents.createdAt, start),
            lt(searchEvents.createdAt, end),
            sql`${searchEvents.type} in ('click_whatsapp', 'click_call')`
          )
        )) ?? [];

    const [{ contacts = 0 } = {}] =
      (await db
        .select({
          contacts: sql<number>`count(*)`,
        })
        .from(contactEvents)
        .where(
          and(
            eq(contactEvents.companyId, companyId),
            gte(contactEvents.createdAt, start),
            lt(contactEvents.createdAt, end)
          )
        )) ?? [];

    const [{ spentCents = 0 } = {}] =
      (await db
        .select({
          spentCents: sql<number>`coalesce(sum(${billingTransactions.amountCents}), 0)`,
        })
        .from(billingTransactions)
        .where(
          and(
            eq(billingTransactions.companyId, companyId),
            eq(billingTransactions.type, "search_debit"),
            gte(billingTransactions.occurredAt, start),
            lt(billingTransactions.occurredAt, end)
          )
        )) ?? [];

    if (impressions === 0 && clicks === 0 && contacts === 0 && spentCents === 0) {
      return null;
    }

    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;

    const message = `Impressões: ${impressions} (${paidImpressions} pagas). Cliques: ${clicks} (WhatsApp ${whatsappClicks} / Ligações ${callClicks}). CTR: ${ctr.toFixed(
      1
    )}%.`;
    const reason = `Gasto no periodo: R$ ${(spentCents / 100).toFixed(2)} (${paidImpressions} impressões pagas). Contatos: ${contacts}.`;

    return {
      message,
      reason,
      metadata: {
        impressions,
        paidImpressions,
        clicks,
        whatsappClicks,
        callClicks,
        ctr,
        spentCents,
        contacts,
      },
    };
  }

  private formatBucketDate(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
}
