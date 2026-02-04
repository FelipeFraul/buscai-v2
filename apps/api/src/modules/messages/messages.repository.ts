import { and, desc, eq, gte, lte } from "drizzle-orm";

import { db } from "../../core/database/client";
import { messageHistory } from "./messages.schema";

export type MessageHistoryRow = {
  id: string;
  companyId: string;
  direction: "inbound" | "outbound";
  peerE164: string;
  providerMessageId: string | null;
  text: string;
  searchId: string | null;
  meta: unknown;
  createdAt: Date;
};

export type MessageHistoryFilters = {
  companyId: string;
  peerE164?: string;
  direction?: "inbound" | "outbound";
  from?: Date;
  to?: Date;
  limit: number;
  offset: number;
};

export class MessagesRepository {
  async insertMany(entries: Array<Omit<MessageHistoryRow, "id" | "createdAt">>) {
    if (!entries.length) {
      return;
    }

    await db.insert(messageHistory).values(entries);
  }

  async listHistory(filters: MessageHistoryFilters): Promise<MessageHistoryRow[]> {
    const conditions = [
      eq(messageHistory.companyId, filters.companyId),
      filters.peerE164 ? eq(messageHistory.peerE164, filters.peerE164) : null,
      filters.direction ? eq(messageHistory.direction, filters.direction) : null,
      filters.from ? gte(messageHistory.createdAt, filters.from) : null,
      filters.to ? lte(messageHistory.createdAt, filters.to) : null,
    ].filter(Boolean);

    const rows = await db
      .select({
        id: messageHistory.id,
        companyId: messageHistory.companyId,
        direction: messageHistory.direction,
        peerE164: messageHistory.peerE164,
        providerMessageId: messageHistory.providerMessageId,
        text: messageHistory.text,
        searchId: messageHistory.searchId,
        meta: messageHistory.meta,
        createdAt: messageHistory.createdAt,
      })
      .from(messageHistory)
      .where(and(...(conditions as [unknown, ...unknown[]])))
      .orderBy(desc(messageHistory.createdAt))
      .limit(filters.limit)
      .offset(filters.offset);

    return rows ?? [];
  }
}
