import { logger } from "../../core/logger";
import { assertNoSensitiveKeys, sanitizeAuditPayload } from "../../core/audit/sanitize";

import { InternalAuditRepository } from "./internal-audit.repository";

export class InternalAuditService {
  constructor(private readonly repository: InternalAuditRepository) {}

  async logSafeEvent(params: {
    type: Parameters<InternalAuditRepository["recordEvent"]>[0]["type"];
    payload: Record<string, unknown>;
  }): Promise<void> {
    if (process.env.NODE_ENV !== "production") {
      assertNoSensitiveKeys(params.payload);
    }

    try {
      const payload = sanitizeAuditPayload(params.payload);
      await this.repository.recordEvent({ type: params.type, payload });
    } catch (error) {
      logger.warn("internal_audit_failed", {
        eventType: params.type,
        errorMessage: (error as Error).message,
      });
    }
  }

  async logEvent(params: {
    type: Parameters<InternalAuditRepository["recordEvent"]>[0]["type"];
    payload: Record<string, unknown>;
  }): Promise<void> {
    await this.logSafeEvent(params);
  }
}
