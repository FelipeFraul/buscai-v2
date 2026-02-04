import fastify from "fastify";
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { registerRoutes } from "../src/core/http/router";
import { signAccessToken } from "../src/core/auth/jwt";
import { db } from "../src/core/database/client";
import { cities, niches } from "../src/modules/catalog/catalog.schema";
import { serpapiImportRecords, serpapiImportRuns } from "../src/modules/serpapi/serpapi.schema";
import { CompaniesRepository } from "../src/modules/companies/companies.repository";
import { companies } from "../src/modules/companies/companies.schema";
import { users } from "../src/modules/auth/auth.schema";

describe("Serpapi publish record", () => {
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

    const [created] = await db
      .insert(users)
      .values({
        name: "Admin Test",
        email: `admin-serpapi-${Date.now()}@local`,
        passwordHash: "hash",
        role: "admin",
      })
      .returning({ id: users.id });
    userId = created?.id ?? "00000000-0000-0000-0000-000000000002";
    token = signAccessToken({ id: userId, role: "admin" });

    const [city] = await db.select({ id: cities.id }).from(cities).limit(1);
    if (!city?.id) {
      const [createdCity] = await db
        .insert(cities)
        .values({ name: "Cidade Teste", state: "SP", isActive: true })
        .returning({ id: cities.id });
      cityId = createdCity?.id ?? "00000000-0000-0000-0000-000000000001";
    } else {
      cityId = city.id;
    }

    const [niche] = await db.select({ id: niches.id }).from(niches).limit(1);
    if (!niche?.id) {
      const [createdNiche] = await db
        .insert(niches)
        .values({ slug: `niche-${Date.now()}`, label: "Nicho Teste", isActive: true })
        .returning({ id: niches.id });
      nicheId = createdNiche?.id ?? "00000000-0000-0000-0000-000000000002";
    } else {
      nicheId = niche.id;
    }
  });

  const insertRun = async () => {
    const [run] = await db
      .insert(serpapiImportRuns)
      .values({ cityId, nicheId, status: "done", query: "teste" })
      .returning({ id: serpapiImportRuns.id });
    return run?.id ?? "";
  };

  const insertRecord = async (
    runId: string,
    phone: string,
    website?: string,
    title = "Clinica Teste",
    address = "Rua Principal, 123"
  ) => {
    const rawPayload = JSON.stringify({
      title,
      address,
      phone,
      website,
    });
    const [record] = await db
      .insert(serpapiImportRecords)
      .values({
        runId,
        rawPayload,
        dedupeKey: `key-${Date.now()}`,
        status: "conflict",
      })
      .returning({ id: serpapiImportRecords.id });
    return record?.id ?? "";
  };

  it("publishes record and creates company", async () => {
    const runId = await insertRun();
    const suffix = Date.now();
    const recordId = await insertRecord(
      runId,
      `+5515${suffix.toString().slice(-8)}`,
      `https://example-${suffix}.com`,
      `Clinica Teste ${suffix}`,
      `Rua Principal, ${suffix}`
    );

    const res = await app.inject({
      method: "POST",
      url: `/admin/serpapi/runs/${runId}/records/${recordId}/publish`,
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(res.payload);
    expect(payload.mode).toBe("created");
    expect(payload.companyId).toBeTruthy();

    const [company] = await db
      .select({ id: companies.id, status: companies.status, source: companies.source })
      .from(companies)
      .where(eq(companies.id, payload.companyId))
      .limit(1);
    expect(company?.source).toBe("serpapi");
    expect(company?.status).toBe("pending");
  });

  it("returns 409 when dedupe hits and force is false", async () => {
    const companiesRepo = new CompaniesRepository();
    const existing = await companiesRepo.createAdminCompany({
      ownerId: userId,
      createdByUserId: userId,
      tradeName: "Clinica Existente",
      cityId,
      address: "Rua B, 456",
      phone: "+5515998887777",
      whatsapp: null,
      website: "https://duplicado.com",
      status: "active",
      source: "manual",
      qualityScore: 70,
      nicheId,
    });

    const runId = await insertRun();
    const recordId = await insertRecord(runId, "+55 15 99888-7777", "https://duplicado.com");

    const res = await app.inject({
      method: "POST",
      url: `/admin/serpapi/runs/${runId}/records/${recordId}/publish`,
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });

    expect(res.statusCode).toBe(409);
    const payload = JSON.parse(res.payload);
    expect(payload.message).toBe("dedupe_conflict");
    expect(Array.isArray(payload.dedupeHits)).toBe(true);
    expect(payload.dedupeHits.length).toBeGreaterThan(0);
    expect(payload.dedupeHits.some((hit: { id: string }) => Boolean(hit.id))).toBe(true);
  });

  it("publishes record with force even when dedupe exists", async () => {
    const runId = await insertRun();
    const recordId = await insertRecord(runId, "+5515988877700", "https://force.com");

    const res = await app.inject({
      method: "POST",
      url: `/admin/serpapi/runs/${runId}/records/${recordId}/publish`,
      headers: { authorization: `Bearer ${token}` },
      payload: { force: true, statusAfter: "active" },
    });

    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(res.payload);
    expect(payload.mode).toBe("created");

    const [company] = await db
      .select({ id: companies.id, status: companies.status })
      .from(companies)
      .where(eq(companies.id, payload.companyId))
      .limit(1);
    expect(company?.status).toBe("active");
  });
});
