import { describe, expect, it, vi } from "vitest";

import { AppError } from "../src/core/errors";
import { SearchService } from "../src/modules/search/search.service";

const makeService = (overrides: Partial<any> = {}) => {
  const repo = {
    findSearchById: vi.fn().mockResolvedValue({ id: "s1", nicheId: "n1", cityId: "cX" }),
    findResultById: vi.fn().mockResolvedValue({
      id: "r1",
      searchId: "s1",
      companyId: "c1",
      position: 1,
      isPaid: true,
    }),
    registerClickByResultId: vi.fn().mockResolvedValue(undefined),
    findCompaniesByIds: vi.fn().mockResolvedValue([
      {
        company: {
          id: "c1",
          tradeName: "Comp 1",
          phone: "123",
          whatsapp: "456",
        },
        city: null,
        niches: [],
      },
    ]),
  };

  Object.assign(repo, overrides);

  const auction = {} as any;
  const billing = {} as any;
  const audit = { logEvent: vi.fn(async () => undefined) } as any;
  const contact = { recordContact: vi.fn(async () => undefined) } as any;

  const service = new SearchService(repo as any, auction, billing, audit, contact);

  return { service, repo, audit, contact };
};

describe("Search click hardening", () => {
  it("registers click using result data, ignoring payload companyId", async () => {
    const { service, repo, audit, contact } = makeService();

    await service.registerClick("s1", {
      resultId: "r1",
      channelType: "whatsapp",
      companyId: "fake-company",
    } as any);

    expect(repo.registerClickByResultId).toHaveBeenCalledWith("r1", expect.any(String));
    expect(contact.recordContact).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: "c1" })
    );
    expect(audit.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "search_click",
        payload: expect.objectContaining({ companyId: "c1" }),
      })
    );
  });

  it("rejects when result does not exist", async () => {
    const { service } = makeService({ findResultById: vi.fn().mockResolvedValue(null) });
    await expect(
      service.registerClick("s1", { resultId: "missing", channelType: "phone" } as any)
    ).rejects.toBeInstanceOf(AppError);
  });

  it("rejects when result searchId mismatches", async () => {
    const { service } = makeService({
      findResultById: vi.fn().mockResolvedValue({
        id: "rX",
        searchId: "other",
        companyId: "c1",
        position: 2,
        isPaid: false,
      }),
    });
    await expect(
      service.registerClick("s1", { resultId: "rX", channelType: "phone" } as any)
    ).rejects.toBeInstanceOf(AppError);
  });
});
