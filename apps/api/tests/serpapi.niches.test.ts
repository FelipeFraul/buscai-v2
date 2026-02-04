import { describe, expect, it, vi } from "vitest";

import { SerpapiController } from "../src/modules/serpapi/serpapi.controller";

describe("SerpapiController niches", () => {
  it("returns niche distribution list", async () => {
    const listNicheDistribution = vi.fn().mockResolvedValue([
      { nicheId: "n1", nicheName: "Dentista", companiesCount: 12 },
    ]);
    const controller = new SerpapiController({ listNicheDistribution } as any);
    const request = { query: { query: "dent" } } as any;
    const reply = { send: vi.fn(), status: vi.fn().mockReturnThis() } as any;

    await controller.listNiches(request, reply);

    expect(listNicheDistribution).toHaveBeenCalledWith("dent");
    expect(reply.send).toHaveBeenCalledWith([
      { nicheId: "n1", nicheName: "Dentista", companiesCount: 12 },
    ]);
    expect(reply.status).not.toHaveBeenCalled();
  });

  it("returns companies for a niche", async () => {
    const listNicheCompanies = vi.fn().mockResolvedValue({
      niche: { id: "00000000-0000-0000-0000-000000000001", name: "Dentista" },
      companies: [],
    });
    const controller = new SerpapiController({ listNicheCompanies } as any);
    const request = {
      params: { nicheId: "00000000-0000-0000-0000-000000000001" },
    } as any;
    const reply = { send: vi.fn(), status: vi.fn().mockReturnThis() } as any;

    await controller.listNicheCompanies(request, reply);

    expect(listNicheCompanies).toHaveBeenCalledWith("00000000-0000-0000-0000-000000000001");
    expect(reply.send).toHaveBeenCalledWith({
      niche: { id: "00000000-0000-0000-0000-000000000001", name: "Dentista" },
      companies: [],
    });
  });
});
