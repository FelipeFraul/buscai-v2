import { db } from "../../core/database/client";

import { internalEvents } from "./internal-audit.schema";

export class InternalAuditRepository {
  async recordEvent(params: {
    type: (typeof internalEvents.$inferInsert)["type"];
    payload: Record<string, unknown>;
  }): Promise<void> {
    await db.insert(internalEvents).values({
      type: params.type,
      payload: params.payload,
    });
  }
}
