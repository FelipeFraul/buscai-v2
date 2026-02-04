import { and, desc, eq, gte, lte, sql } from "drizzle-orm";

import { db, type DatabaseClient } from "../../core/database/client";

import { niches } from "../catalog/catalog.schema";
import { contactEvents } from "./contact.schema";

type DbSession = DatabaseClient;
export type ContactEventRecord = typeof contactEvents.$inferSelect;
export type ContactChannel = ContactEventRecord["channel"];
export type ContactClassification = ContactEventRecord["classification"];

export type ContactFilters = {
  channel?: ContactChannel;
  classification?: ContactClassification | "null";
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
};

export class ContactRepository {
  constructor(private readonly database: DbSession = db) {}

  async createEvent(data: {
    companyId: string;
    channel: ContactChannel;
    phone: string;
    name?: string | null;
    nicheId?: string | null;
    classification?: ContactClassification | null;
    createdAt?: Date;
  }): Promise<ContactEventRecord> {
    const [row] = await this.database
      .insert(contactEvents)
      .values({
        companyId: data.companyId,
        channel: data.channel,
        phone: data.phone,
        name: data.name ?? null,
        nicheId: data.nicheId ?? null,
        classification: data.classification ?? null,
        createdAt: data.createdAt ?? new Date(),
      })
      .returning();

    if (!row) {
      throw new Error("Failed to insert contact event");
    }

    return row;
  }

  async listByCompany(
    companyId: string,
    filters: ContactFilters
  ): Promise<{ items: ContactEventRecord[]; total: number; page: number; pageSize: number }> {
    const where = [eq(contactEvents.companyId, companyId)];

    if (filters.channel) {
      where.push(eq(contactEvents.channel, filters.channel));
    }

    if (filters.classification === "null") {
      where.push(sql`${contactEvents.classification} is null`);
    } else if (filters.classification) {
      where.push(eq(contactEvents.classification, filters.classification));
    }

    if (filters.dateFrom) {
      where.push(gte(contactEvents.createdAt, new Date(filters.dateFrom)));
    }

    if (filters.dateTo) {
      where.push(lte(contactEvents.createdAt, new Date(filters.dateTo)));
    }

    const page = Math.max(filters.page ?? 1, 1);
    const pageSize = Math.max(Math.min(filters.pageSize ?? 20, 100), 1);
    const offset = (page - 1) * pageSize;

    const [totalRow, items] = await Promise.all([
      this.database
        .select({ value: sql<number>`count(${contactEvents.id})` })
        .from(contactEvents)
        .where(and(...where))
        .limit(1),
      this.database
        .select()
        .from(contactEvents)
        .where(and(...where))
        .orderBy(desc(contactEvents.createdAt))
        .limit(pageSize)
        .offset(offset),
    ]);

    const total = Number(totalRow[0]?.value ?? 0);

    return { items, total, page, pageSize };
  }

  async updateClassification(params: {
    companyId: string;
    contactId: string;
    classification: ContactClassification | null;
  }): Promise<ContactEventRecord | null> {
    const [row] = await this.database
      .update(contactEvents)
      .set({ classification: params.classification })
      .where(and(eq(contactEvents.id, params.contactId), eq(contactEvents.companyId, params.companyId)))
      .returning();

    return row ?? null;
  }

  async countByCompany(
    companyId: string,
    range?: { from?: Date; to?: Date; nicheId?: string }
  ): Promise<number> {
    const where = [eq(contactEvents.companyId, companyId)];

    if (range?.from) {
      where.push(gte(contactEvents.createdAt, range.from));
    }

    if (range?.to) {
      where.push(lte(contactEvents.createdAt, range.to));
    }

    if (range?.nicheId) {
      where.push(eq(contactEvents.nicheId, range.nicheId));
    }

    const rows = await this.database
      .select({ value: sql<number>`count(${contactEvents.id})` })
      .from(contactEvents)
      .where(and(...where));

    return Number(rows[0]?.value ?? 0);
  }

  async groupByDayOfWeek(
    companyId: string,
    range?: { from?: Date; to?: Date; nicheId?: string }
  ) {
    const where = [eq(contactEvents.companyId, companyId)];
    if (range?.from) where.push(gte(contactEvents.createdAt, range.from));
    if (range?.to) where.push(lte(contactEvents.createdAt, range.to));
    if (range?.nicheId) where.push(eq(contactEvents.nicheId, range.nicheId));

    const dowExpr = sql<number>`extract(dow from ${contactEvents.createdAt})`;

    const rows = await this.database
      .select({
        dow: dowExpr,
        total: sql<number>`count(${contactEvents.id})`,
      })
      .from(contactEvents)
      .where(and(...where))
      .groupBy(dowExpr)
      .orderBy(dowExpr);

    return rows.map((row) => ({
      dow: Number(row.dow ?? 0),
      total: Number(row.total ?? 0),
    }));
  }

  async groupByHour(
    companyId: string,
    range?: { from?: Date; to?: Date; nicheId?: string }
  ) {
    const where = [eq(contactEvents.companyId, companyId)];
    if (range?.from) where.push(gte(contactEvents.createdAt, range.from));
    if (range?.to) where.push(lte(contactEvents.createdAt, range.to));
    if (range?.nicheId) where.push(eq(contactEvents.nicheId, range.nicheId));

    const hourExpr = sql<number>`extract(hour from ${contactEvents.createdAt})`;

    const rows = await this.database
      .select({
        hour: hourExpr,
        total: sql<number>`count(${contactEvents.id})`,
      })
      .from(contactEvents)
      .where(and(...where))
      .groupBy(hourExpr)
      .orderBy(hourExpr);

    return rows.map((row) => ({
      hour: Number(row.hour ?? 0),
      total: Number(row.total ?? 0),
    }));
  }

  async topNiche(companyId: string, range?: { from?: Date; to?: Date; nicheId?: string }) {
    const where = [eq(contactEvents.companyId, companyId)];
    if (range?.from) where.push(gte(contactEvents.createdAt, range.from));
    if (range?.to) where.push(lte(contactEvents.createdAt, range.to));
    if (range?.nicheId) where.push(eq(contactEvents.nicheId, range.nicheId));

    const rows = await this.database
      .select({
        nicheId: contactEvents.nicheId,
        niche: niches.label,
        total: sql<number>`count(${contactEvents.id})`,
      })
      .from(contactEvents)
      .leftJoin(niches, eq(contactEvents.nicheId, niches.id))
      .where(and(...where))
      .groupBy(contactEvents.nicheId, niches.label)
      .orderBy(sql`count(${contactEvents.id}) DESC`)
      .limit(1);

    if (!rows[0] || !rows[0].nicheId) {
      return null;
    }

    return {
      nicheId: rows[0].nicheId,
      niche: rows[0].niche ?? "",
      total: Number(rows[0].total ?? 0),
    };
  }
}
