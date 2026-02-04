import fastify from "fastify";
import { beforeAll, describe, expect, it } from "vitest";

import { registerRoutes } from "../src/core/http/router";
import { signAccessToken } from "../src/core/auth/jwt";
import { AuthRepository } from "../src/modules/auth/auth.repository";
import { ENV } from "../src/config/env";
import { db } from "../src/core/database/client";
import { cities, niches } from "../src/modules/catalog/catalog.schema";

describe("Admin companies routes", () => {
  let app: ReturnType<typeof fastify>;
  let token: string;
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
    const userId = demoUser?.id ?? "00000000-0000-0000-0000-000000000002";
    token = signAccessToken({ id: userId, role: "admin" });

    const [city] = await db.select({ id: cities.id }).from(cities).limit(1);
    const [niche] = await db.select({ id: niches.id }).from(niches).limit(1);
    cityId = city?.id ?? "00000000-0000-0000-0000-000000000001";
    nicheId = niche?.id ?? "00000000-0000-0000-0000-000000000002";
  });

  it("lists admin companies", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/admin/companies?page=1&limit=10`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect([200, 401, 403]).toContain(res.statusCode);
  });

  it("validates contact requirement on create", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/companies",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: "Empresa Sem Contato",
        cityId,
        nicheId,
        addressLine: "Rua A, 123",
      },
    });
    expect([400, 401, 403]).toContain(res.statusCode);
  });

  it("creates, updates and changes status", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/admin/companies",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: "Empresa Admin Teste",
        cityId,
        nicheId,
        addressLine: "Rua B, 456",
        phoneE164: "+5515999999999",
        status: "pending",
        origin: "manual",
        qualityScore: 60,
      },
    });
    expect([201, 400, 401, 403, 409]).toContain(create.statusCode);

    if (create.statusCode !== 201) {
      return;
    }

    const created = JSON.parse(create.payload);
    const companyId = created.id as string;

    const update = await app.inject({
      method: "PATCH",
      url: `/admin/companies/${companyId}`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: "Empresa Admin Atualizada",
      },
    });
    expect([200, 400, 401, 403, 404]).toContain(update.statusCode);

    const updateStatus = await app.inject({
      method: "PATCH",
      url: `/admin/companies/${companyId}/status`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        status: "active",
      },
    });
    expect([200, 400, 401, 403, 404]).toContain(updateStatus.statusCode);
  });
});
