import { createHash } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../src/core/errors";
import { ComplaintsController } from "../src/modules/complaints/complaints.controller";
import { ComplaintsService } from "../src/modules/complaints/complaints.service";

type ComplaintRecord = {
  id: string;
  companyId: string;
  searchId?: string | null;
  resultId?: string | null;
  reason: string;
  comment?: string | null;
  channel: string;
  customerHash?: string | null;
  status?: string;
  createdAt?: Date;
};

class FakeComplaintsRepository {
  complaints: ComplaintRecord[] = [];
  async createComplaint(payload: any) {
    const record: ComplaintRecord = {
      id: `c-${this.complaints.length + 1}`,
      status: payload.status ?? "OPEN",
      createdAt: payload.createdAt ?? new Date(),
      ...payload,
    };
    this.complaints.push(record);
    return record;
  }

  async countComplaintsByCompanyAndHashSince(
    companyId: string,
    customerHash: string,
    since: Date
  ): Promise<number> {
    return this.complaints.filter(
      (c) =>
        c.companyId === companyId &&
        c.customerHash === customerHash &&
        (c.createdAt?.getTime() ?? 0) >= since.getTime()
    ).length;
  }
}

class FakeSearchRepository {
  result: any = null;
  async findResultById(resultId: string) {
    if (this.result && this.result.id === resultId) {
      return this.result;
    }
    return null;
  }
}

class FakeAuditService {
  logEvent = vi.fn(async () => undefined);
}

const buildService = (options?: { searchResult?: any }) => {
  const complaintsRepository = new FakeComplaintsRepository() as any;
  const searchRepository = new FakeSearchRepository() as any;
  if (options?.searchResult) {
    searchRepository.result = options.searchResult;
  }
  const auditService = new FakeAuditService() as any;
  const service = new ComplaintsService(
    complaintsRepository,
    searchRepository,
    auditService
  );

  return { service, complaintsRepository, searchRepository, auditService };
};

describe("ComplaintsService", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("registers complaint resolving company from resultId", async () => {
    const { service, complaintsRepository, auditService } = buildService({
      searchResult: { id: "r-1", companyId: "comp-1", searchId: "s-1" },
    });

    const result = await service.registerComplaint({
      resultId: "r-1",
      reason: "NO_STOCK",
      channel: "web",
    });

    expect(result.companyId).toBe("comp-1");
    expect(complaintsRepository.complaints).toHaveLength(1);
    expect(auditService.logEvent).toHaveBeenCalled();
  });

  it("registers complaint using provided companyId", async () => {
    const { service, complaintsRepository } = buildService();

    const result = await service.registerComplaint({
      companyId: "comp-2",
      reason: "BAD_SERVICE",
      channel: "web",
      comment: "atraso",
    });

    expect(result.companyId).toBe("comp-2");
    expect(complaintsRepository.complaints[0]?.comment).toBe("atraso");
  });

  it("throws when neither companyId nor resultId is provided", async () => {
    const { service } = buildService();
    await expect(
      service.registerComplaint({
        reason: "NO_STOCK",
        channel: "web",
      } as any)
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("applies rate limit per customer hash and company", async () => {
    const { service, complaintsRepository } = buildService();
    const customerContact = "user@example.com";
    const companyId = "comp-1";
    const now = Date.now();
    const hash = createHash("sha256").update(customerContact.trim().toLowerCase()).digest("hex");
    complaintsRepository.complaints.push(
      {
        id: "c1",
        companyId,
        reason: "NO_STOCK",
        channel: "web",
        customerHash: hash,
        status: "OPEN",
        createdAt: new Date(now - 10 * 60 * 1000),
      },
      {
        id: "c2",
        companyId,
        reason: "NO_STOCK",
        channel: "web",
        customerHash: hash,
        status: "OPEN",
        createdAt: new Date(now - 5 * 60 * 1000),
      },
      {
        id: "c3",
        companyId,
        reason: "NO_STOCK",
        channel: "web",
        customerHash: hash,
        status: "OPEN",
        createdAt: new Date(now - 2 * 60 * 1000),
      }
    );

    await expect(
      service.registerComplaint({
        companyId,
        reason: "BAD_SERVICE",
        channel: "web",
        customerContact,
      })
    ).rejects.toMatchObject({ statusCode: 429 });
  });
});

describe("ComplaintsController", () => {
  it("returns 400 when payload misses companyId and resultId", async () => {
    const service = { registerComplaint: vi.fn() };
    const controller = new ComplaintsController(service as any);
    const reply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn(),
    };

    await controller.register(
      { body: { reason: "NO_STOCK", channel: "web" } } as any,
      reply as any
    );

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(service.registerComplaint).not.toHaveBeenCalled();
  });
});
