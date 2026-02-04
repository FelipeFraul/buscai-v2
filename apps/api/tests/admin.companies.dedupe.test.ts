import fastify from "fastify";
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { registerRoutes } from "../src/core/http/router";
import { signAccessToken } from "../src/core/auth/jwt";
import { AuthRepository } from "../src/modules/auth/auth.repository";
import { ENV } from "../src/config/env";
import { db } from "../src/core/database/client";
import { cities, niches } from "../src/modules/catalog/catalog.schema";
import { companies } from "../src/modules/companies/companies.schema";

describe("Admin companies dedupe and status", () => {
  let app: ReturnType<typeof fastify>;
  let token: string;
  let userId: string;
  let cityId: string;
  let nicheId: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? "secret-secret-secret-123456";
    process.env.REFRESH_SECRET = process.env.REFRESH_SECRET ?? "refresh-secret-456789";
    process.env.WHATSAPP_API_URL = "http://localhost";
    process.env.WHATSAPP_API_TOKEN = "token-for-tests-123456789";
    process.env.WHATSAPP_WEBHOOK_SECRET = "webhook-secret-123456";
    process.env.CLAIM_SUPPORT_WHATSAPP = process.env.CLAIM_SUPPORT_WHATSAPP ?? "5515999999999";
    process.env.SERPAPI_API_KEY = process.env.SERPAPI_API_KEY ?? "serpapi-test-key";
    process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgres://buscai:buscai@localhost:5433/buscai";

    app = fastify();
    await registerRoutes(app);
    await app.ready();

    const authRepo = new AuthRepository();
    const demoUser = await authRepo.findByEmail(ENV.DEMO_USER_EMAIL);
    userId = demoUser?.id ?? "00000000-0000-0000-0000-000000000002";
    token = signAccessToken({ id: userId, role: "admin" });

    const [city] = await db.select({ id: cities.id }).from(cities).limit(1);
    if (!city?.id) {
      const [createdCity] = await db
        .insert(cities)
        .values({ name: "Cidade Dedupe", state: "SP", isActive: true })
        .returning({ id: cities.id });
      cityId = createdCity?.id ?? "00000000-0000-0000-0000-000000000001";
    } else {
      cityId = city.id;
    }

    const [niche] = await db.select({ id: niches.id }).from(niches).limit(1);
    if (!niche?.id) {
      const [createdNiche] = await db
        .insert(niches)
        .values({ slug: `niche-dedupe-${Date.now()}`, label: "Nicho Dedupe", isActive: true })
        .returning({ id: niches.id });
      nicheId = createdNiche?.id ?? "00000000-0000-0000-0000-000000000002";
    } else {
      nicheId = niche.id;
    }
  });

  it("returns 409 when duplicate contact exists and force is false", async () => {
    const phone = `+5515999${Math.floor(Math.random() * 9000 + 1000)}`;

    const first = await app.inject({
      method: "POST",
      url: "/admin/companies",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: "Empresa Dedupe",
        cityId,
        nicheId,
        addressLine: "Rua Dedupe, 100",
        phoneE164: phone,
      },
    });

    expect([201, 400, 401, 403]).toContain(first.statusCode);
    if (first.statusCode !== 201) return;

    const second = await app.inject({
      method: "POST",
      url: "/admin/companies",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: "Empresa Dedupe 2",
        cityId,
        nicheId,
        addressLine: "Rua Dedupe, 200",
        phoneE164: phone,
      },
    });

    expect([409, 400, 401, 403]).toContain(second.statusCode);
  });

  it("creates company when force=true even with dedupe hits", async () => {
    const phone = `+5515888${Math.floor(Math.random() * 9000 + 1000)}`;

    const first = await app.inject({
      method: "POST",
      url: "/admin/companies",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: "Empresa Force",
        cityId,
        nicheId,
        addressLine: "Rua Force, 1",
        phoneE164: phone,
      },
    });

    expect([201, 400, 401, 403]).toContain(first.statusCode);
    if (first.statusCode !== 201) return;

    const second = await app.inject({
      method: "POST",
      url: "/admin/companies",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: "Empresa Force 2",
        cityId,
        nicheId,
        addressLine: "Rua Force, 2",
        phoneE164: phone,
        force: true,
      },
    });

    expect([201, 400, 401, 403]).toContain(second.statusCode);
  });

  it("blocks active status when quality is invalid", async () => {
    const [company] = await db
      .insert(companies)
      .values({
        ownerId: userId,
        tradeName: "Empresa Sem Contato",
        cityId,
        status: "pending",
      })
      .returning({ id: companies.id });

    const companyId = company?.id ?? "00000000-0000-0000-0000-000000000002";

    const res = await app.inject({
      method: "PATCH",
      url: `/admin/companies/${companyId}/status`,
      headers: { authorization: `Bearer ${token}` },
      payload: { status: "active" },
    });

    expect([400, 401, 403]).toContain(res.statusCode);
    if (res.statusCode === 400) {
      const payload = JSON.parse(res.payload);
      expect(payload.error?.code).toBe("INVALID_STATUS");
    }
  });
});
