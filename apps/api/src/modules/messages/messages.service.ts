import { MessagesRepository, type MessageHistoryRow } from "./messages.repository";

export type MessageHistoryEntry = Omit<MessageHistoryRow, "id" | "createdAt">;

export type MessageHistoryQuery = {
  companyId: string;
  peerE164?: string;
  direction?: "inbound" | "outbound";
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
};

export class MessagesService {
  constructor(private readonly repository: MessagesRepository) {}

  async recordMany(entries: MessageHistoryEntry[]) {
    await this.repository.insertMany(entries);
  }

  async listHistory(query: MessageHistoryQuery) {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const offset = Math.max(query.offset ?? 0, 0);

    const items = await this.repository.listHistory({
      companyId: query.companyId,
      peerE164: query.peerE164,
      direction: query.direction,
      from: query.from,
      to: query.to,
      limit,
      offset,
    });

    const nextOffset = items.length === limit ? offset + limit : null;

    return {
      items,
      nextOffset,
    };
  }
}
