import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { ContactController } from "../src/modules/contacts/contact.controller";
import { ContactService } from "../src/modules/contacts/contact.service";

const buildController = () => {
  const service = {
    listContacts: vi.fn().mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 6,
    }),
  } as any;

  const controller = new ContactController(service);
  return { controller, service };
};

const mockRequest = (overrides: Partial<any>) => ({
  user: { id: "user-1", role: "company_owner", companyId: "company-1" },
  params: { companyId: "company-1" },
  query: {},
  ...overrides,
});

const mockReply = () => {
  const payload: any = {};
  return {
    status: vi.fn().mockReturnThis(),
    send: vi.fn((body) => {
      payload.body = body;
      return body;
    }),
    get body() {
      return payload.body;
    },
  };
};

describe("ContactController list - query validation", () => {
  it("accepts page/pageSize only without classification filters", async () => {
    const { controller, service } = buildController();
    const request = mockRequest({ query: { page: "1", pageSize: "6" } });
    const reply = mockReply();

    await controller.list(request as any, reply as any);

    expect(service.listContacts).toHaveBeenCalled();
    expect(reply.send).toHaveBeenCalledWith({
      items: [],
      total: 0,
      page: 1,
      pageSize: 6,
    });
  });

  it("still accepts explicit classification filters", async () => {
    const { controller } = buildController();
    const request = mockRequest({ query: { classification: "null" } });
    const reply = mockReply();

    await expect(controller.list(request as any, reply as any)).resolves.not.toThrow(z.ZodError);
  });
});

describe("ContactService listContacts classification handling", () => {
  const fakeRepo = {
    listByCompany: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 }),
  };
  const fakeCompaniesRepo = {
    getCompanyByIdForOwner: vi.fn().mockResolvedValue({ id: "company-1" }),
  };

  const service = new ContactService(fakeRepo as any, fakeCompaniesRepo as any);
  const actor = { userId: "user-1", role: "company_owner" as const };

  it("accepts undefined classification (no filter)", async () => {
    await service.listContacts(actor, "company-1", { page: 1, pageSize: 6 });
    expect(fakeRepo.listByCompany).toHaveBeenCalledWith("company-1", expect.objectContaining({ classification: undefined }));
  });

  it("accepts explicit 'null' classification", async () => {
    await service.listContacts(actor, "company-1", { classification: "null" as any });
    expect(fakeRepo.listByCompany).toHaveBeenCalledWith("company-1", expect.objectContaining({ classification: undefined }));
  });

  it("accepts explicit string classification", async () => {
    await service.listContacts(actor, "company-1", { classification: "new_client" as any });
    expect(fakeRepo.listByCompany).toHaveBeenCalledWith("company-1", expect.objectContaining({ classification: "new_client" }));
  });
});
