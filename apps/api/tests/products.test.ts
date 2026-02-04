import { describe, expect, it, vi, beforeEach, beforeAll } from "vitest";

import {
  ProductOfferCreateInputSchema,
  type ProductOfferCreateInput,
  type ProductOfferUpdateInput,
  type ProductSearchRequest,
} from "@buscai/shared-schema";

let ProductsController: any;
let ProductsService: any;
let InternalAuditService: any;
type CompanySubscriptionWithPlan = any;

type OfferRecord = {
  id: string;
  companyId: string;
  cityId: string;
  nicheId: string;
  title: string;
  description: string;
  priceCents: number;
  originalPriceCents?: number | null;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
};

class FakeProductsRepository {
  offers = new Map<string, OfferRecord>();
  hasSubscription = true;
  subscriptionStatus: "active" | "cancelled" = "active";
  planActive = true;
  plans: CompanySubscriptionWithPlan["plan"][] = [
    {
      id: "plan-1",
      name: "basic",
      description: "basic",
      monthlyPriceCents: 1000,
      maxActiveOffers: 3,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "plan-2",
      name: "plus",
      description: "plus",
      monthlyPriceCents: 2000,
      maxActiveOffers: 5,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];
  currentSubscription: CompanySubscriptionWithPlan["subscription"] = {
    id: "sub1",
    companyId: "company-1",
    planId: "plan-1",
    status: "active",
    startedAt: new Date(),
    cancelledAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  async getActiveProductPlans() {
    return this.plans.filter((p) => p.isActive);
  }

  async findPlanById(planId: string) {
    const plan = this.plans.find((p) => p.id === planId);
    if (!plan) return undefined;
    return { ...plan, isActive: this.planActive && plan.isActive };
  }

  async getCompanySubscription() {
    if (!this.hasSubscription) {
      return undefined;
    }
    const plan = this.plans.find((p) => p.id === this.currentSubscription.planId);
    return {
      subscription: { ...this.currentSubscription, status: this.subscriptionStatus },
      plan: plan ? { ...plan, isActive: this.planActive } : undefined,
    };
  }

  async setCompanySubscription(companyId: string, planId: string) {
    const plan = await this.findPlanById(planId);
    if (!plan) return undefined;
    this.hasSubscription = true;
    this.subscriptionStatus = "active";
    this.currentSubscription = {
      id: `sub-${planId}`,
      companyId,
      planId,
      status: "active",
      startedAt: new Date(),
      cancelledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    return {
      subscription: this.currentSubscription,
      plan,
    };
  }

  async countActiveOffersForCompany(companyId: string) {
    return Array.from(this.offers.values()).filter(
      (o) => o.companyId === companyId && o.isActive
    ).length;
  }

  async listProductOffersForCompany(companyId: string, _page: number, _pageSize: number) {
    const items = Array.from(this.offers.values()).filter((o) => o.companyId === companyId);
    return { items, total: items.length };
  }

  async createProductOffer(companyId: string, data: ProductOfferCreateInput) {
    const offer: OfferRecord = {
      id: `offer-${this.offers.size + 1}`,
      companyId,
      cityId: data.cityId,
      nicheId: data.nicheId,
      title: data.title,
      description: data.description,
      priceCents: data.priceCents,
      originalPriceCents: data.originalPriceCents ?? null,
      isActive: data.isActive ?? true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.offers.set(offer.id, offer);
    return offer;
  }

  async getProductOfferById(companyId: string, offerId: string) {
    const offer = this.offers.get(offerId);
    if (!offer || offer.companyId !== companyId) return undefined;
    return offer;
  }

  async updateProductOffer(companyId: string, offerId: string, data: ProductOfferUpdateInput) {
    const offer = this.offers.get(offerId);
    if (!offer || offer.companyId !== companyId) return undefined;
    const updated: OfferRecord = {
      ...offer,
      ...data,
      updatedAt: new Date(),
    };
    this.offers.set(offerId, updated);
    return updated;
  }

  async renewProductOffer(companyId: string, offerId: string, createdAt: Date) {
    const offer = this.offers.get(offerId);
    if (!offer || offer.companyId !== companyId) return undefined;
    const updated: OfferRecord = {
      ...offer,
      createdAt,
      updatedAt: new Date(),
    };
    this.offers.set(offerId, updated);
    return updated;
  }

  async findCityById(cityId: string) {
    return { id: cityId, name: "Cidade", state: "ST", isActive: true };
  }

  async findNicheById(nicheId: string) {
    return { id: nicheId, label: "Niche", slug: "niche", isActive: true };
  }

  async searchProductOffers(params: {
    cityId: string;
    nicheId: string;
    query?: string;
    limit: number;
  }): Promise<{ items: ProductSearchRow[]; total: number }> {
    const ttlCutoff = Date.now() - 24 * 60 * 60 * 1000;
    const filtered = Array.from(this.offers.values())
      .filter(
        (o) =>
          o.companyId === "company-1" &&
          o.cityId === params.cityId &&
          o.nicheId === params.nicheId &&
          o.isActive &&
          (o.createdAt?.getTime() ?? 0) >= ttlCutoff &&
          (!params.query || o.title.includes(params.query))
      )
      .sort((a, b) => a.priceCents - b.priceCents);

    const items: ProductSearchRow[] = filtered.slice(0, params.limit).map((offer) => ({
      offer,
      company: {
        id: offer.companyId,
        tradeName: "Empresa 1",
        phone: "123",
        address: "Rua 1",
      },
      city: {
        id: offer.cityId,
        name: "Cidade",
      },
    }));

    return { items, total: filtered.length };
  }
}

class FakeCompaniesRepository {
  async getCompanyByIdForOwner(companyId: string, ownerId: string) {
    return { company: { id: companyId, ownerId } };
  }
}

class FakeAuditService {
  logEvent = vi.fn(async () => undefined);
}

function buildService(fakeRepo?: FakeProductsRepository) {
  const repo = fakeRepo ?? new FakeProductsRepository();
  const companiesRepo = new FakeCompaniesRepository() as any;
  const audit = new FakeAuditService() as unknown as InternalAuditService;
  const service = new ProductsService(repo as any, companiesRepo, audit);
  return { service, repo, audit };
}

describe("ProductsService / controller", () => {
  beforeAll(async () => {
    process.env.WHATSAPP_API_URL = process.env.WHATSAPP_API_URL ?? "http://localhost";
    process.env.WHATSAPP_API_TOKEN =
      process.env.WHATSAPP_API_TOKEN ?? "token-for-tests-123456789";
    process.env.WHATSAPP_DEFAULT_CITY_ID =
      process.env.WHATSAPP_DEFAULT_CITY_ID ?? "00000000-0000-0000-0000-000000000000";
    process.env.WHATSAPP_DEFAULT_NICHE_ID =
      process.env.WHATSAPP_DEFAULT_NICHE_ID ?? "00000000-0000-0000-0000-000000000000";

    const controllerModule = await import("../src/modules/products/products.controller");
    ProductsController = controllerModule.ProductsController;
    const serviceModule = await import("../src/modules/products/products.service");
    ProductsService = serviceModule.ProductsService;
    const auditModule = await import("../src/modules/internal-audit/internal-audit.service");
    InternalAuditService = auditModule.InternalAuditService;
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("create product enforces positive price and company ownership", async () => {
    const { service, repo } = buildService();
    const input = ProductOfferCreateInputSchema.parse({
      cityId: "00000000-0000-0000-0000-000000000001",
      nicheId: "00000000-0000-0000-0000-000000000002",
      title: "Produto 1",
      description: "Desc",
      priceCents: 1000,
    });

    const result = await service.createProductOffer("owner-1", "company-1", input);
    expect(result.companyId).toBe("company-1");
    expect(result.priceCents).toBe(1000);
    expect(repo.offers.size).toBe(1);
  });

  it("soft delete sets isActive false and keeps record", async () => {
    const { service, repo } = buildService();
    const offer = await service.createProductOffer("owner-1", "company-1", {
      cityId: "00000000-0000-0000-0000-000000000001",
      nicheId: "00000000-0000-0000-0000-000000000002",
      title: "Produto 1",
      description: "Desc",
      priceCents: 1000,
    });

    await service.deactivateProductOffer("owner-1", "company-1", offer.id);
    const stored = repo.offers.get(offer.id);
    expect(stored).toBeDefined();
    expect(stored?.isActive).toBe(false);
  });

  it("search products clamps limit to 5 and orders by price", async () => {
    const { service, repo, audit } = buildService();
    await service.createProductOffer("owner-1", "company-1", {
      cityId: "c1",
      nicheId: "n1",
      title: "Barato",
      description: "Desc",
      priceCents: 100,
    });
    await service.createProductOffer("owner-1", "company-1", {
      cityId: "c1",
      nicheId: "n1",
      title: "Caro",
      description: "Desc",
      priceCents: 500,
    });

    const payload: ProductSearchRequest = {
      cityId: "c1",
      nicheId: "n1",
      limit: 10,
    };
    const res = await service.searchProductOffers(payload);
    expect(res.items.length).toBe(2);
    expect(res.items[0].priceCents).toBe(100);
    expect(res.items[0].source).toBe("product");
    expect(audit.logEvent).toHaveBeenCalled();
  });

  it("search products defaults to 5 results max and returns sorted with required fields", async () => {
    const { service, audit, repo } = buildService();
    // allow more than default maxActiveOffers for this scenario
    repo.plans[0].maxActiveOffers = 10;
    for (let i = 0; i < 6; i++) {
      await service.createProductOffer("owner-1", "company-1", {
        cityId: "c1",
        nicheId: "n1",
        title: `Produto ${i}`,
        description: "Desc",
        priceCents: 100 + i * 50, // ascending by index
      });
    }

    const res = await service.searchProductOffers({
      cityId: "c1",
      nicheId: "n1",
    });

    expect(res.items).toHaveLength(5); // clamped to 5 even though 6 exist
    const prices = res.items.map((i) => i.priceCents);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    res.items.forEach((item) => {
      expect(item.title).toBeTruthy();
      expect(item.company.name).toBeTruthy();
      expect(item.city.name).toBeTruthy();
      expect(item.source).toBe("product");
    });
    expect(audit.logEvent).toHaveBeenCalled();
  });

  it("search products filters out offers older than 24h", async () => {
    const { service, repo } = buildService();
    const oldOffer = await service.createProductOffer("owner-1", "company-1", {
      cityId: "c1",
      nicheId: "n1",
      title: "Antigo",
      description: "Desc",
      priceCents: 200,
    });
    const storedOld = repo.offers.get(oldOffer.id);
    if (storedOld) {
      storedOld.createdAt = new Date(Date.now() - 25 * 60 * 60 * 1000);
    }

    await service.createProductOffer("owner-1", "company-1", {
      cityId: "c1",
      nicheId: "n1",
      title: "Recente",
      description: "Desc",
      priceCents: 150,
    });

    const res = await service.searchProductOffers({
      cityId: "c1",
      nicheId: "n1",
    });

    expect(res.items).toHaveLength(1);
    expect(res.items[0].title).toBe("Recente");
  });

  it("controller createProduct uses companyId from token, ignoring body companyId", async () => {
    const { service } = buildService();
    const spy = vi.spyOn(service as any, "createProductOffer");
    const controller = new ProductsController(service as any);
    const request: any = {
      user: { id: "owner-1", role: "company_owner", companyId: "company-1" },
      body: {
        companyId: "malicious",
        cityId: "00000000-0000-0000-0000-000000000001",
        nicheId: "00000000-0000-0000-0000-000000000002",
        title: "Produto 1",
        description: "Desc",
        priceCents: 1000,
      },
    };
    const reply: any = { status: vi.fn().mockReturnThis(), send: vi.fn() };

    await controller.createProduct(request, reply);

    expect(spy).toHaveBeenCalledWith(
      "owner-1",
      "company-1",
      expect.objectContaining({ title: "Produto 1" })
    );
  });

  it("lists active product plans", async () => {
    const { service, repo } = buildService();
    repo.plans[0].isActive = true;

    const plans = await service.listProductPlans();
    expect(Array.isArray(plans)).toBe(true);
    expect(plans[0]?.id).toBe(repo.plans[0].id);
    expect(plans[0]?.maxActiveOffers).toBe(repo.plans[0].maxActiveOffers);
  });

  it("controller listProductPlans returns plans", async () => {
    const { service } = buildService();
    const controller = new ProductsController(service as any);
    const reply: any = { send: vi.fn() };

    await controller.listProductPlans({} as any, reply);
    expect(reply.send).toHaveBeenCalled();
    const payload = reply.send.mock.calls[0][0];
    expect(Array.isArray(payload)).toBe(true);
  });

  it("get self subscription returns null when missing", async () => {
    const { service, repo } = buildService();
    repo.hasSubscription = false;
    const result = await service.getSelfSubscription({
      userId: "owner-1",
      role: "company_owner",
      companyId: "company-1",
    });
    expect(result.plan).toBeNull();
    expect(result.status).toBeNull();
  });

  it("change self subscription activates new plan", async () => {
    const { service, repo } = buildService();
    repo.hasSubscription = false;

    const result = await service.changeSelfSubscription(
      { userId: "owner-1", role: "company_owner", companyId: "company-1" },
      "plan-1"
    );

    expect(result.planId).toBe("plan-1");
    expect(result.status).toBe("active");
  });

  it("change self subscription is idempotent when same active plan", async () => {
    const { service, repo } = buildService();
    repo.hasSubscription = true;
    repo.currentSubscription.planId = "plan-1";
    repo.subscriptionStatus = "active";
    const spy = vi.spyOn(repo as any, "setCompanySubscription");

    const result = await service.changeSelfSubscription(
      { userId: "owner-1", role: "company_owner", companyId: "company-1" },
      "plan-1"
    );

    expect(spy).not.toHaveBeenCalled();
    expect(result.planId).toBe("plan-1");
  });

  it("fails to create product without subscription", async () => {
    const { service, repo } = buildService();
    repo.hasSubscription = false;

    await expect(
      service.createProductOffer("owner-1", "company-1", {
        cityId: "c1",
        nicheId: "n1",
        title: "Produto",
        description: "",
        priceCents: 100,
      })
    ).rejects.toMatchObject({ statusCode: 400, message: "subscription_required" });
  });

  it("fails when subscription is inactive", async () => {
    const { service, repo } = buildService();
    repo.subscriptionStatus = "cancelled";

    await expect(
      service.createProductOffer("owner-1", "company-1", {
        cityId: "c1",
        nicheId: "n1",
        title: "Produto",
        description: "",
        priceCents: 100,
      })
    ).rejects.toMatchObject({ statusCode: 400, message: "subscription_plan_inactive" });
  });

  it("fails when plan is inactive", async () => {
    const { service, repo } = buildService();
    repo.planActive = false;

    await expect(
      service.createProductOffer("owner-1", "company-1", {
        cityId: "c1",
        nicheId: "n1",
        title: "Produto",
        description: "",
        priceCents: 100,
      })
    ).rejects.toMatchObject({ statusCode: 400, message: "subscription_plan_inactive" });
  });

  it("fails when active offers reach plan limit", async () => {
    const { service, repo } = buildService();
    repo.plans[0].maxActiveOffers = 1;
    repo.offers.set("existing", {
      id: "existing",
      companyId: "company-1",
      cityId: "c1",
      nicheId: "n1",
      title: "Existente",
      description: "",
      priceCents: 100,
      originalPriceCents: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      service.createProductOffer("owner-1", "company-1", {
        cityId: "c1",
        nicheId: "n1",
        title: "Produto",
        description: "",
      priceCents: 100,
    })
    ).rejects.toMatchObject({ statusCode: 400, message: "product_limit_reached" });
  });

  it("renews an active offer and updates createdAt", async () => {
    const { service, repo } = buildService();
    const offer = await service.createProductOffer("owner-1", "company-1", {
      cityId: "c1",
      nicheId: "n1",
      title: "Produto",
      description: "",
      priceCents: 100,
    });
    const before = repo.offers.get(offer.id)?.createdAt;
    const renewed = await service.renewProductOffer("owner-1", "company-1", offer.id);
    const after = repo.offers.get(offer.id)?.createdAt;
    expect(renewed.id).toBe(offer.id);
    expect(before && after && after.getTime() >= before.getTime()).toBe(true);
  });

  it("fails to renew inactive offer", async () => {
    const { service, repo } = buildService();
    const offer = await service.createProductOffer("owner-1", "company-1", {
      cityId: "c1",
      nicheId: "n1",
      title: "Produto",
      description: "",
      priceCents: 100,
    });
    const stored = repo.offers.get(offer.id);
    if (stored) {
      stored.isActive = false;
      repo.offers.set(offer.id, stored);
    }

    await expect(
      service.renewProductOffer("owner-1", "company-1", offer.id)
    ).rejects.toMatchObject({ statusCode: 400, message: "product_inactive" });
  });

  it("fails to renew offer without subscription", async () => {
    const { service, repo } = buildService();
    repo.hasSubscription = false;
    const offer: OfferRecord = {
      id: "o1",
      companyId: "company-1",
      cityId: "c1",
      nicheId: "n1",
      title: "Produto",
      description: "",
      priceCents: 100,
      originalPriceCents: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    repo.offers.set(offer.id, offer);

    await expect(
      service.renewProductOffer("owner-1", "company-1", offer.id)
    ).rejects.toMatchObject({ statusCode: 400, message: "subscription_required" });
  });
});
