import { describe, expect, it, vi } from "vitest";

import { SerpapiController } from "../src/modules/serpapi/serpapi.controller";

describe("SerpapiController listRecords", () => {
  it("returns records payload and forwards parsed query args", async () => {
    const payload = {
      items: [
        {
          id: "record-1",
          status: "conflict",
          companyId: null,
          dedupeKey: null,
          reason: null,
          rawPreview: null,
        },
      ],
      total: 1,
      limit: 20,
      offset: 0,
    };

    const listRecordsForRun = vi.fn().mockResolvedValue(payload);
    const controller = new SerpapiController({ listRecordsForRun } as any);

    const request = {
      params: { runId: "11111111-1111-4111-8111-111111111111" },
      query: { status: "conflict", limit: "20", offset: "0" },
    } as any;
    const reply = {
      send: vi.fn(),
      status: vi.fn().mockReturnThis(),
    } as any;

    await controller.listRecords(request, reply);

    expect(listRecordsForRun).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111", {
      status: "conflict",
      limit: 20,
      offset: 0,
    });
    expect(reply.send).toHaveBeenCalledWith(payload);
  });

  it("uses defaults when query params are missing", async () => {
    const payload = {
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
    };

    const listRecordsForRun = vi.fn().mockResolvedValue(payload);
    const controller = new SerpapiController({ listRecordsForRun } as any);

    const request = {
      params: { runId: "33333333-3333-4333-8333-333333333333" },
      query: {},
    } as any;
    const reply = {
      send: vi.fn(),
      status: vi.fn().mockReturnThis(),
    } as any;

    await controller.listRecords(request, reply);

    expect(listRecordsForRun).toHaveBeenCalledWith("33333333-3333-4333-8333-333333333333", {
      status: undefined,
      limit: 20,
      offset: 0,
    });
    expect(reply.send).toHaveBeenCalledWith(payload);
  });

  it("returns 404 when run not found", async () => {
    const controller = new SerpapiController({
      listRecordsForRun: vi.fn().mockResolvedValue(null),
    } as any);

    const request = {
      params: { runId: "22222222-2222-4222-8222-222222222222" },
      query: {},
    } as any;
    const reply = {
      send: vi.fn(),
      status: vi.fn().mockReturnThis(),
    } as any;

    await controller.listRecords(request, reply);

    expect(reply.status).toHaveBeenCalledWith(404);
    expect(reply.send).toHaveBeenCalledWith({ message: "run_not_found" });
  });

  it("returns 400 when query invalid", async () => {
    const controller = new SerpapiController({
      listRecordsForRun: vi.fn(),
    } as any);

    const request = {
      params: { runId: "11111111-1111-4111-8111-111111111111" },
      query: { status: "xxx", limit: "999", offset: "-1" },
    } as any;
    const reply = {
      send: vi.fn(),
      status: vi.fn().mockReturnThis(),
    } as any;

    await controller.listRecords(request, reply);

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalled();
    const [[payload]] = reply.send.mock.calls;
    expect(payload.error?.code).toBe("INVALID_PAYLOAD");
  });
});
