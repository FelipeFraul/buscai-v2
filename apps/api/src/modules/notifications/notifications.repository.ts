import { and, asc, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";

import { db } from "../../core/database/client";
import {
  notificationPreferences,
  notifications,
} from "./notifications.schema";

export type NotificationCategory =
  | "financial"
  | "visibility"
  | "subscription"
  | "contacts"
  | "system";

export type NotificationSeverity = "low" | "medium" | "high";
export type NotificationKind = "event" | "summary" | "alert";
export type NotificationFrequency = "real_time" | "daily" | "weekly" | "never";

export type NotificationRow = {
  id: string;
  companyId: string;
  category: NotificationCategory;
  severity: NotificationSeverity;
  kind: NotificationKind;
  title: string;
  message: string | null;
  reason: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  dedupeKey: string | null;
  bucketDate: string | null;
  metadata: unknown;
  readAt: Date | null;
  createdAt: Date;
};

export type NotificationInsert = {
  companyId: string;
  category: NotificationCategory;
  severity: NotificationSeverity;
  kind: NotificationKind;
  title: string;
  message?: string | null;
  reason?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  dedupeKey?: string | null;
  bucketDate?: string | null;
  metadata?: unknown;
};

export type NotificationListFilters = {
  companyId: string;
  category?: NotificationCategory;
  severity?: NotificationSeverity;
  kind?: NotificationKind;
  unreadOnly?: boolean;
  from?: Date;
  to?: Date;
  limit: number;
  offset: number;
};

export type NotificationPreferencesRow = {
  companyId: string;
  panelEnabled: boolean;
  financialEnabled: boolean;
  visibilityEnabled: boolean;
  subscriptionEnabled: boolean;
  contactsEnabled: boolean;
  systemEnabled: boolean;
  frequency: NotificationFrequency;
  whatsappEnabled: boolean;
  emailEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type NotificationPreferencesUpdate = Partial<
  Omit<NotificationPreferencesRow, "companyId" | "createdAt" | "updatedAt">
>;

export class NotificationsRepository {
  async getPreferences(companyId: string): Promise<NotificationPreferencesRow | null> {
    const [row] = await db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.companyId, companyId))
      .limit(1);
    return row ?? null;
  }

  async createDefaultPreferences(
    companyId: string
  ): Promise<NotificationPreferencesRow> {
    const [row] = await db
      .insert(notificationPreferences)
      .values({ companyId })
      .onConflictDoNothing()
      .returning();

    if (row) {
      return row;
    }

    const existing = await this.getPreferences(companyId);
    if (!existing) {
      throw new Error("notification_preferences_not_found");
    }
    return existing;
  }

  async updatePreferences(
    companyId: string,
    update: NotificationPreferencesUpdate
  ): Promise<NotificationPreferencesRow> {
    const [row] = await db
      .update(notificationPreferences)
      .set({
        ...update,
        updatedAt: new Date(),
      })
      .where(eq(notificationPreferences.companyId, companyId))
      .returning();

    if (!row) {
      await this.createDefaultPreferences(companyId);
      const [created] = await db
        .update(notificationPreferences)
        .set({
          ...update,
          updatedAt: new Date(),
        })
        .where(eq(notificationPreferences.companyId, companyId))
        .returning();
      if (!created) {
        throw new Error("notification_preferences_update_failed");
      }
      return created;
    }

    return row;
  }

  async insertNotification(payload: NotificationInsert): Promise<NotificationRow | null> {
    const [row] = await db
      .insert(notifications)
      .values({
        companyId: payload.companyId,
        category: payload.category,
        severity: payload.severity,
        kind: payload.kind,
        title: payload.title,
        message: payload.message ?? null,
        reason: payload.reason ?? null,
        ctaLabel: payload.ctaLabel ?? null,
        ctaUrl: payload.ctaUrl ?? null,
        dedupeKey: payload.dedupeKey ?? null,
        bucketDate: payload.bucketDate ?? null,
        metadata: payload.metadata ?? null,
      })
      .onConflictDoNothing()
      .returning();

    return row ?? null;
  }

  async listNotifications(filters: NotificationListFilters): Promise<NotificationRow[]> {
    const conditions = [
      eq(notifications.companyId, filters.companyId),
      filters.category ? eq(notifications.category, filters.category) : null,
      filters.severity ? eq(notifications.severity, filters.severity) : null,
      filters.kind ? eq(notifications.kind, filters.kind) : null,
      filters.unreadOnly ? isNull(notifications.readAt) : null,
      filters.from ? gte(notifications.createdAt, filters.from) : null,
      filters.to ? lte(notifications.createdAt, filters.to) : null,
    ].filter(Boolean);

    const rows = await db
      .select({
        id: notifications.id,
        companyId: notifications.companyId,
        category: notifications.category,
        severity: notifications.severity,
        kind: notifications.kind,
        title: notifications.title,
        message: notifications.message,
        reason: notifications.reason,
        ctaLabel: notifications.ctaLabel,
        ctaUrl: notifications.ctaUrl,
        dedupeKey: notifications.dedupeKey,
        bucketDate: notifications.bucketDate,
        metadata: notifications.metadata,
        readAt: notifications.readAt,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .where(and(...(conditions as [unknown, ...unknown[]])))
      .orderBy(desc(notifications.createdAt), asc(notifications.id))
      .limit(filters.limit)
      .offset(filters.offset);

    return rows ?? [];
  }

  async markRead(companyId: string, ids: string[]): Promise<number> {
    if (!ids.length) {
      return 0;
    }

    const result = await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(eq(notifications.companyId, companyId), inArray(notifications.id, ids))
      );

    return result.rowCount ?? 0;
  }
}
