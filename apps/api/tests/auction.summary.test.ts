import { describe, expect, it, vi } from "vitest";

import { AuctionController } from "../src/modules/auction/auction.controller";

describe("GET /auction/summary", () => {
  it("returns summary for company_owner with companyId", async () => {
    const summary = {
      cityId: "city-1",
      nicheId: "niche-1",
      marketSlots: [],
      todaySpentCents: 0,
      todayImpressionsPaid: 0,
      todayClicks: 0,
      status: "active",
      walletBalanceCents: 0,
      walletReservedCents: 0,
      avgPaidPosition: null,
      ctr: null,
    };

    const service = {
      getSummary: vi.fn().mockResolvedValue(summary),
    };
    const controller = new AuctionController(service as any);
    const request: any = {
      user: { role: "company_owner", companyId: "company-1" },
      query: { cityId: "city-1", nicheId: "niche-1" },
    };
    const reply: any = { status: () => reply, send: (payload: unknown) => payload };

    const res = await controller.getSummary(request, reply);

    expect(service.getSummary).toHaveBeenCalledWith({
      companyId: "company-1",
      cityId: "city-1",
      nicheId: "niche-1",
    });
    expect(res).toEqual(summary);
  });
});
