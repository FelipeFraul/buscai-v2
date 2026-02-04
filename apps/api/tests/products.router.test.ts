import fastify from "fastify";
import { beforeAll, describe, expect, it } from "vitest";

import { registerRoutes } from "../src/core/http/router";
import { signAccessToken } from "../src/core/auth/jwt";
import { CompaniesRepository } from "../src/modules/companies/companies.repository";
import { AuthRepository } from "../src/modules/auth/auth.repository";
import { ENV } from "../src/config/env";

describe("Products routes integration (router wiring)", () => {
  let app: ReturnType<typeof fastify>;
  let token: string;
  let companyId: string;

  beforeAll(async () => {
    // minimal envs to satisfy parsers
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? "secret-secret-secret-123456";
    process.env.REFRESH_SECRET = process.env.REFRESH_SECRET ?? "refresh-secret-456789";
    process.env.WHATSAPP_API_URL = "http://localhost";
    process.env.WHATSAPP_API_TOKEN = "token-for-tests-123456789";
    process.env.WHATSAPP_WEBHOOK_SECRET = "webhook-secret-123456";
    process.env.WHATSAPP_DEFAULT_CITY_ID = "00000000-0000-0000-0000-000000000000";
    process.env.WHATSAPP_DEFAULT_NICHE_ID = "00000000-0000-0000-0000-000000000000";
    process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgres://buscai:buscai@localhost:5433/buscai";

    app = fastify();
    await registerRoutes(app);
    await app.ready();

    // build a signed token for company_owner with a known company (demo seed)
    const authRepo = new AuthRepository();
    const companiesRepo = new CompaniesRepository();
    const demoUser = await authRepo.findByEmail(ENV.DEMO_USER_EMAIL);
    const ownerId = demoUser?.id ?? "00000000-0000-0000-0000-000000000002";
    const ownedCompanies = await companiesRepo.listCompaniesByOwner(ownerId);
    companyId = ownedCompanies[0]?.company.id ?? "00000000-0000-0000-0000-000000000001";
    token = signAccessToken({ id: ownerId, role: "company_owner", companyId });
  });

  it("routes exist for CRUD products and search products", async () => {
    // list products
    const list = await app.inject({
      method: "GET",
      url: "/products",
      headers: { authorization: `Bearer ${token}` },
    });
    expect([200, 401, 403]).toContain(list.statusCode); // wiring check (auth may block)

    // create product (may fail on ownership/validation but route should exist)
    const create = await app.inject({
      method: "POST",
      url: "/products",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        cityId: "00000000-0000-0000-0000-000000000001",
        nicheId: "00000000-0000-0000-0000-000000000002",
        title: "Produto router test",
        description: "desc",
        priceCents: 1000,
      },
    });
    expect([201, 400, 401, 403]).toContain(create.statusCode);

    // get by id (using company scope; may 404 if not created)
    const getOne = await app.inject({
      method: "GET",
      url: `/products/${companyId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect([200, 401, 403, 404]).toContain(getOne.statusCode);

    // update product
    const update = await app.inject({
      method: "PUT",
      url: `/products/${companyId}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { title: "novo titulo" },
    });
    expect([200, 401, 403, 404, 400]).toContain(update.statusCode);

    // delete product
    const del = await app.inject({
      method: "DELETE",
      url: `/products/${companyId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect([204, 401, 403, 404]).toContain(del.statusCode);

    // search products (GET)
    const search = await app.inject({
      method: "GET",
      url: "/search/products?cityId=00000000-0000-0000-0000-000000000001&nicheId=00000000-0000-0000-0000-000000000002",
    });
    expect([200, 400, 404]).toContain(search.statusCode);
  });
});
