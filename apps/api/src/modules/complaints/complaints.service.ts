import { createHash } from "crypto";

import { AppError } from "../../core/errors";
import { InternalAuditService } from "../internal-audit/internal-audit.service";
import { SearchRepository } from "../search/search.repository";
import {
  type ComplaintRecord,
  complaintChannelEnum,
  complaintReasonEnum,
} from "./complaints.schema";
import { ComplaintsRepository } from "./complaints.repository";

type RegisterComplaintInput = {
  companyId?: string;
  resultId?: string;
  searchId?: string;
  reason: (typeof complaintReasonEnum.enumValues)[number];
  comment?: string | null;
  channel: (typeof complaintChannelEnum.enumValues)[number];
  customerContact?: string | null;
};

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1h
const RATE_LIMIT_PER_HASH = 3;

export class ComplaintsService {
  constructor(
    private readonly complaintsRepository: ComplaintsRepository,
    private readonly searchRepository: SearchRepository,
    private readonly auditService: InternalAuditService
  ) {}

  async registerComplaint(input: RegisterComplaintInput): Promise<ComplaintRecord> {
    const resolvedCompanyId = await this.resolveCompanyId(input);
    const customerHash = this.hashContact(input.customerContact);

    if (customerHash) {
      const recentCount =
        await this.complaintsRepository.countComplaintsByCompanyAndHashSince(
          resolvedCompanyId,
          customerHash,
          new Date(Date.now() - RATE_LIMIT_WINDOW_MS)
        );

      if (recentCount >= RATE_LIMIT_PER_HASH) {
        throw new AppError(429, "too_many_complaints");
      }
    }

    const record = await this.complaintsRepository.createComplaint({
      companyId: resolvedCompanyId,
      searchId: input.searchId ?? null,
      resultId: input.resultId ?? null,
      reason: input.reason,
      comment: input.comment ?? null,
      channel: input.channel,
      customerHash: customerHash ?? null,
    });

    await this.auditService.logEvent({
      type: "customer_complaint_registered",
      payload: {
        companyId: resolvedCompanyId,
        reason: input.reason,
        channel: input.channel,
      },
    });

    return record;
  }

  private async resolveCompanyId(input: RegisterComplaintInput): Promise<string> {
    if (input.resultId) {
      const result = await this.searchRepository.findResultById(input.resultId);
      if (!result) {
        throw new AppError(400, "invalid_result");
      }

      // Prefer searchId from the result when not provided
      if (!input.searchId && result.searchId) {
        input.searchId = result.searchId;
      }

      return result.companyId;
    }

    if (input.companyId) {
      return input.companyId;
    }

    throw new AppError(400, "company_required");
  }

  private hashContact(contact?: string | null): string | null {
    if (!contact) {
      return null;
    }

    const normalized = contact.trim().toLowerCase();
    if (!normalized) {
      return null;
    }

    return createHash("sha256").update(normalized).digest("hex");
  }
}
