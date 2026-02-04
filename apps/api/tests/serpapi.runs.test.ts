import { describe, expect, it, vi } from "vitest";

import { SerpapiController } from "../src/modules/serpapi/serpapi.controller";

describe("SerpapiController listRuns", () => {
  it("returns empty array when no runs exist", async () => {
    const listRuns = vi.fn().mockResolvedValue([]);
    const controller = new SerpapiController({ listRuns } as any);
    const request = { query: {} } as any;
    const reply = {
      send: vi.fn(),
      status: vi.fn().mockReturnThis(),
    } as any;

    await controller.listRuns(request, reply);

    expect(listRuns).toHaveBeenCalledWith(1, 10);
    expect(reply.send).toHaveBeenCalledWith([]);
    expect(reply.status).not.toHaveBeenCalled();
  });
});
