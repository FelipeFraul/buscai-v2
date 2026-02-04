import { and, desc, eq, gte, sql } from "drizzle-orm";

import { db } from "../../core/database/client";
import { niches } from "../catalog/catalog.schema";
import { whatsappBlocks, whatsappQueryEvents } from "./whatsapp-abuse.schema";

const SAME_NICHE_THRESHOLD = 3;
const SAME_NICHE_WINDOW_HOURS = 24;
const SAME_NICHE_BLOCK_HOURS = 24;

const DISTINCT_NICHE_THRESHOLD = 6;
const DISTINCT_NICHE_WINDOW_HOURS = 24;
const DISTINCT_NICHE_BLOCK_HOURS = 6;

const ALERT_SAME_NICHE_WINDOW_HOURS = 1;
const ALERT_DISTINCT_NICHE_WINDOW_HOURS = 6;

type ActiveBlock = {
  phone: string;
  reason: string;
  message: string | null;
  blockedUntil: Date;
};

export type WhatsappAbuseAlert = {
  phone: string;
  nicheId?: string | null;
  nicheLabel?: string | null;
  count: number;
  firstAt: Date;
  lastAt: Date;
  blockedUntil?: Date | null;
  blockReason?: string | null;
};

export type WhatsappBlockEntry = {
  phone: string;
  reason: string;
  message: string | null;
  blockedUntil: Date;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
};

export class WhatsappAbuseService {
  normalizePhone(value: string): string {
    return value.replace(/\D/g, "");
  }

  async getActiveBlock(phone: string): Promise<ActiveBlock | null> {
    const now = new Date();
    const normalized = this.normalizePhone(phone);
    const [block] = await db
      .select()
      .from(whatsappBlocks)
      .where(
        and(
          eq(whatsappBlocks.phone, normalized),
          eq(whatsappBlocks.isActive, true),
          gte(whatsappBlocks.blockedUntil, now)
        )
      )
      .orderBy(desc(whatsappBlocks.createdAt))
      .limit(1);

    if (!block) {
      return null;
    }

    return {
      phone: block.phone,
      reason: block.reason,
      message: block.message ?? null,
      blockedUntil: block.blockedUntil,
    };
  }

  async logQuery(params: { phone: string; nicheId: string; queryText?: string | null }) {
    const normalized = this.normalizePhone(params.phone);
    await db.insert(whatsappQueryEvents).values({
      phone: normalized,
      nicheId: params.nicheId,
      queryText: params.queryText ?? null,
    });
  }

  async evaluateAndBlock(params: {
    phone: string;
    nicheId: string;
    createdByUserId?: string | null;
  }): Promise<{ blocked: boolean; message?: string }> {
    const normalized = this.normalizePhone(params.phone);
    const now = new Date();
    const windowStart = new Date(now.getTime() - SAME_NICHE_WINDOW_HOURS * 60 * 60 * 1000);
    const distinctWindowStart = new Date(
      now.getTime() - DISTINCT_NICHE_WINDOW_HOURS * 60 * 60 * 1000
    );

    const sameNicheCountRow = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(whatsappQueryEvents)
      .where(
        and(
          eq(whatsappQueryEvents.phone, normalized),
          eq(whatsappQueryEvents.nicheId, params.nicheId),
          gte(whatsappQueryEvents.createdAt, windowStart)
        )
      );
    const sameNicheCount = sameNicheCountRow[0]?.count ?? 0;
    const projectedSameNicheCount = sameNicheCount + 1;
    if (projectedSameNicheCount >= SAME_NICHE_THRESHOLD) {
      const message = `Voce ja fez ${SAME_NICHE_THRESHOLD} consultas nesse mesmo nicho e ficara bloqueado por ${SAME_NICHE_BLOCK_HOURS}h.`;
      await this.upsertBlock({
        phone: normalized,
        reason: "same_niche_daily",
        message,
        blockedUntil: new Date(now.getTime() + SAME_NICHE_BLOCK_HOURS * 60 * 60 * 1000),
        createdByUserId: params.createdByUserId ?? null,
      });
      return { blocked: true, message };
    }

    const distinctRow = await db
      .select({ count: sql<number>`count(distinct ${whatsappQueryEvents.nicheId})`.mapWith(Number) })
      .from(whatsappQueryEvents)
      .where(
        and(
          eq(whatsappQueryEvents.phone, normalized),
          gte(whatsappQueryEvents.createdAt, distinctWindowStart)
        )
      );
    const distinctCount = distinctRow[0]?.count ?? 0;
    const projectedDistinctCount = distinctCount + (sameNicheCount > 0 ? 0 : 1);
    if (projectedDistinctCount >= DISTINCT_NICHE_THRESHOLD) {
      const message = `Voce fez ${DISTINCT_NICHE_THRESHOLD} consultas em nichos diferentes e ficara bloqueado por ${DISTINCT_NICHE_BLOCK_HOURS}h.`;
      await this.upsertBlock({
        phone: normalized,
        reason: "distinct_niches_daily",
        message,
        blockedUntil: new Date(now.getTime() + DISTINCT_NICHE_BLOCK_HOURS * 60 * 60 * 1000),
        createdByUserId: params.createdByUserId ?? null,
      });
      return { blocked: true, message };
    }

    return { blocked: false };
  }

  async listAlerts(): Promise<{
    sameNiche: WhatsappAbuseAlert[];
    distinctNiches: WhatsappAbuseAlert[];
    blocks: WhatsappBlockEntry[];
  }> {
    const now = new Date();
    const sameWindowStart = new Date(now.getTime() - ALERT_SAME_NICHE_WINDOW_HOURS * 60 * 60 * 1000);
    const distinctWindowStart = new Date(
      now.getTime() - ALERT_DISTINCT_NICHE_WINDOW_HOURS * 60 * 60 * 1000
    );

    const sameNiche = await db
      .select({
        phone: whatsappQueryEvents.phone,
        nicheId: whatsappQueryEvents.nicheId,
        nicheLabel: niches.label,
        count: sql<number>`count(*)`.mapWith(Number),
        firstAt: sql<Date>`min(${whatsappQueryEvents.createdAt})`,
        lastAt: sql<Date>`max(${whatsappQueryEvents.createdAt})`,
      })
      .from(whatsappQueryEvents)
      .leftJoin(niches, eq(whatsappQueryEvents.nicheId, niches.id))
      .where(gte(whatsappQueryEvents.createdAt, sameWindowStart))
      .groupBy(whatsappQueryEvents.phone, whatsappQueryEvents.nicheId, niches.label)
      .having(sql`count(*) >= ${SAME_NICHE_THRESHOLD}`)
      .orderBy(desc(sql`count(*)`));

    const distinctNiches = await db
      .select({
        phone: whatsappQueryEvents.phone,
        count: sql<number>`count(distinct ${whatsappQueryEvents.nicheId})`.mapWith(Number),
        firstAt: sql<Date>`min(${whatsappQueryEvents.createdAt})`,
        lastAt: sql<Date>`max(${whatsappQueryEvents.createdAt})`,
      })
      .from(whatsappQueryEvents)
      .where(gte(whatsappQueryEvents.createdAt, distinctWindowStart))
      .groupBy(whatsappQueryEvents.phone)
      .having(sql`count(distinct ${whatsappQueryEvents.nicheId}) >= ${DISTINCT_NICHE_THRESHOLD}`)
      .orderBy(desc(sql`count(distinct ${whatsappQueryEvents.nicheId})`));

    const blocks = await db
      .select({
        phone: whatsappBlocks.phone,
        reason: whatsappBlocks.reason,
        message: whatsappBlocks.message,
        blockedUntil: whatsappBlocks.blockedUntil,
        createdAt: whatsappBlocks.createdAt,
        updatedAt: whatsappBlocks.updatedAt,
        isActive: whatsappBlocks.isActive,
      })
      .from(whatsappBlocks)
      .where(eq(whatsappBlocks.isActive, true))
      .orderBy(desc(whatsappBlocks.updatedAt));

    const blockMap = new Map<string, WhatsappBlockEntry>();
    blocks.forEach((block) => {
      blockMap.set(block.phone, block);
    });

    return {
      sameNiche: sameNiche.map((item) => ({
        ...item,
        blockedUntil: blockMap.get(item.phone)?.blockedUntil ?? null,
        blockReason: blockMap.get(item.phone)?.reason ?? null,
      })),
      distinctNiches: distinctNiches.map((item) => ({
        ...item,
        blockedUntil: blockMap.get(item.phone)?.blockedUntil ?? null,
        blockReason: blockMap.get(item.phone)?.reason ?? null,
      })),
      blocks,
    };
  }

  async upsertBlock(params: {
    phone: string;
    reason: string;
    message?: string | null;
    blockedUntil: Date;
    createdByUserId?: string | null;
  }) {
    const normalized = this.normalizePhone(params.phone);
    const now = new Date();
    const [existing] = await db
      .select({ id: whatsappBlocks.id })
      .from(whatsappBlocks)
      .where(
        and(
          eq(whatsappBlocks.phone, normalized),
          eq(whatsappBlocks.isActive, true)
        )
      )
      .orderBy(desc(whatsappBlocks.createdAt))
      .limit(1);

    if (existing) {
      await db
        .update(whatsappBlocks)
        .set({
          reason: params.reason,
          message: params.message ?? null,
          blockedUntil: params.blockedUntil,
          updatedAt: now,
          isActive: true,
          createdByUserId: params.createdByUserId ?? null,
        })
        .where(eq(whatsappBlocks.id, existing.id));
      return;
    }

    await db.insert(whatsappBlocks).values({
      phone: normalized,
      reason: params.reason,
      message: params.message ?? null,
      blockedUntil: params.blockedUntil,
      createdByUserId: params.createdByUserId ?? null,
      createdAt: now,
      updatedAt: now,
      isActive: true,
    });
  }

  async unblock(phone: string) {
    const normalized = this.normalizePhone(phone);
    await db
      .delete(whatsappQueryEvents)
      .where(eq(whatsappQueryEvents.phone, normalized));
    await db
      .update(whatsappBlocks)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(whatsappBlocks.phone, normalized));
  }
}
