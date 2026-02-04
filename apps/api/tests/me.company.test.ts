import { describe, expect, it } from "vitest";

import { CompaniesController } from "../src/modules/companies/companies.controller";
import { CompaniesService } from "../src/modules/companies/companies.service";

class FakeCompaniesRepository {
  async findCompanyWithNiches(companyId: string) {
    if (companyId === "missing") return null;
    return {
      company: {
        id: companyId,
        tradeName: "Minha Empresa",
        legalName: "Minha Empresa LTDA",
        cityId: "city-1",
        address: "Rua A",
        phone: "123",
        whatsapp: "456",
        openingHours: "08-18",
        status: "active",
        createdAt: new Date("2024-01-01"),
      },
      city: { id: "city-1", name: "Cidade", state: "ST" },
      niches: [{ id: "n1", label: "Nicho", slug: "nicho" }],
    };
  }
}

class FakeBillingRepository {
  async getWalletByCompanyId(companyId: string) {
    if (companyId === "missing") return undefined;
    return { companyId, balance: "100", reserved: "10" };
  }
}

class FakeProductsRepository {
  async countActiveOffersForCompany(companyId: string) {
    return companyId === "missing" ? 0 : 5;
  }
}

class FakeAuctionRepository {
  async countConfigsByCompany(companyId: string) {
    return companyId === "missing" ? 0 : 2;
  }
}

const makeController = () => {
  const companiesRepo = new FakeCompaniesRepository() as any;
  const billingRepo = new FakeBillingRepository() as any;
  const productsRepo = new FakeProductsRepository() as any;
  const auctionRepo = new FakeAuctionRepository() as any;
  const service = new CompaniesService(
    companiesRepo,
    billingRepo,
    productsRepo,
    auctionRepo
  );
  const controller = new CompaniesController(service as any);
  return { controller };
};

describe("GET /me/company", () => {
  it("returns overview for company_owner with companyId", async () => {
    const { controller } = makeController();
    const request: any = { user: { role: "company_owner", companyId: "c1" } };
    const reply: any = { status: () => reply, send: (x: any) => x };

    const res = await controller.getMyCompany(request, reply);
    expect(res.company.id).toBe("c1");
    expect(res.company.channels?.phone).toBe("123");
    expect(res.billing?.wallet.balanceCents).toBe(100);
    expect(res.products?.activeOffers).toBe(5);
    expect(res.auction.activeConfigs).toBe(2);
  });

  it("returns 403 if company_owner has no companyId", async () => {
    const { controller } = makeController();
    const request: any = { user: { role: "company_owner", companyId: undefined } };
    const reply: any = { status: () => reply, send: (x: any) => x };
    await expect(controller.getMyCompany(request, reply)).rejects.toBeDefined();
  });
});
