import fastify from "fastify";
import { beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";

import { registerRoutes } from "../src/core/http/router";
import { signAccessToken } from "../src/core/auth/jwt";
import { db } from "../src/core/database/client";
import { cities, niches } from "../src/modules/catalog/catalog.schema";
import { serpapiImportRecords, serpapiImportRuns } from "../src/modules/serpapi/serpapi.schema";
import { companies, companyNiches } from "../src/modules/companies/companies.schema";
import { users } from "../src/modules/auth/auth.schema";

describe("Serpapi manual publish run", () => {
  let app: ReturnType<typeof fastify>;
  let token: string;
  let userId: string;
  let cityId: string;
  let nicheId: string;
  let nicheIdAlt: string;
  const rawRecord = (name: string | null, phone: string | null, address = "Rua A, 10") => ({
    name,
    phone,
    address,
    category: "Nicho Teste",
  });

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? "secret-secret-secret-123456";
    process.env.REFRESH_SECRET = process.env.REFRESH_SECRET ?? "refresh-secret-456789";
    process.env.WHATSAPP_API_URL = "http://localhost";
    process.env.WHATSAPP_API_TOKEN = "token-for-tests-123456789";
    process.env.WHATSAPP_WEBHOOK_SECRET = "webhook-secret-123456";
    process.env.SERPAPI_API_KEY = process.env.SERPAPI_API_KEY ?? "serpapi-test-key";
    process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgres://buscai:buscai@localhost:5433/buscai";

    app = fastify();
    await registerRoutes(app);
    await app.ready();

    const [created] = await db
      .insert(users)
      .values({
        name: "Admin Publish Test",
        email: `admin-publish-${Date.now()}@local`,
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

    const [createdAlt] = await db
      .insert(niches)
      .values({ slug: `niche-alt-${Date.now()}`, label: "Nicho Alternativo", isActive: true })
      .returning({ id: niches.id });
    nicheIdAlt = createdAlt?.id ?? "00000000-0000-0000-0000-000000000003";
  });

  it("publishes manual run with idempotency and metrics", async () => {
    const suffix = Date.now();
    const [run] = await db
      .insert(serpapiImportRuns)
      .values({
        status: "done",
        initiatedByUserId: userId,
        cityId,
        nicheId,
        query: "manual_upload",
        dryRun: false,
        paramsJson: JSON.stringify({
          mapping: {
            name: "nome_empresa",
            phone: "telefone",
            address: "endereco",
            niche: "categoria",
          },
        }),
      })
      .returning({ id: serpapiImportRuns.id });
    const runId = run?.id ?? "";

    const existingPhone = `15${suffix.toString().slice(-9)}`;
    const existingName = `Empresa Existente ${suffix}`;
    const existingAddress = "Rua A, 10";
    await db.insert(companies).values({
      ownerId: userId,
      tradeName: existingName,
      cityId,
      phone: existingPhone,
      address: existingAddress,
      normalizedPhone: existingPhone,
      source: "manual",
    });

    await db.insert(serpapiImportRecords).values([
      {
        runId,
        rawPayload: JSON.stringify(rawRecord(`Empresa Nova ${suffix}`, `15${(suffix + 1).toString().slice(-9)}`, "Rua B, 20")),
        normalizedPayload: {
          name: `Empresa Nova ${suffix}`,
          phone: `15${(suffix + 1).toString().slice(-9)}`,
          address: "Rua B, 20",
          niche: "Nicho Teste",
        },
        dedupeKey: `key-${Date.now()}-1`,
        status: "conflict",
        cityId,
        nicheId,
      },
      {
        runId,
        rawPayload: JSON.stringify(rawRecord(existingName, null, existingAddress)),
        normalizedPayload: {
          name: existingName,
          phone: null,
          address: existingAddress,
          niche: "Nicho Teste",
        },
        dedupeKey: `key-${Date.now()}-2`,
        status: "conflict",
        cityId,
        nicheId,
      },
      {
        runId,
        rawPayload: JSON.stringify(rawRecord(null, "15999993333")),
        normalizedPayload: {
          name: null,
          phone: "15999993333",
          address: "Rua A, 10",
          niche: "Nicho Teste",
        },
        dedupeKey: `key-${Date.now()}-3`,
        status: "conflict",
        cityId,
        nicheId,
      },
    ]);

    const response = await app.inject({
      method: "POST",
      url: `/admin/serpapi/runs/${runId}/publish`,
      headers: { authorization: `Bearer ${token}` },
      payload: { force: false },
    });

    expect(response.statusCode).toBe(200);
    const payload = JSON.parse(response.payload) as {
      inserted: number;
      deduped: number;
      skipped: number;
    };
    expect(payload.inserted).toBe(1);
    expect(payload.deduped).toBe(1);
    expect(payload.skipped).toBe(1);

    const serpapiCount = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(companies)
      .where(eq(companies.source, "serpapi"));
    expect(serpapiCount[0]?.count).toBeGreaterThan(0);

    const [updatedRun] = await db
      .select({
        inserted: serpapiImportRuns.insertedCount,
        deduped: serpapiImportRuns.dedupedCount,
        errors: serpapiImportRuns.errorCount,
      })
      .from(serpapiImportRuns)
      .where(eq(serpapiImportRuns.id, runId))
      .limit(1);
    expect(updatedRun?.inserted).toBeGreaterThanOrEqual(1);
    expect(updatedRun?.deduped).toBeGreaterThanOrEqual(1);
    expect(updatedRun?.errors).toBeGreaterThanOrEqual(1);

    const second = await app.inject({
      method: "POST",
      url: `/admin/serpapi/runs/${runId}/publish`,
      headers: { authorization: `Bearer ${token}` },
      payload: { force: false },
    });
    expect(second.statusCode).toBe(200);
    const secondPayload = JSON.parse(second.payload) as {
      inserted: number;
      deduped: number;
      skipped: number;
    };
    expect(secondPayload.inserted).toBe(0);
    expect(secondPayload.deduped).toBe(0);
    expect(secondPayload.skipped).toBe(0);
  });

  it("uses record niche_id when present and run niche_id when missing", async () => {
    const [run] = await db
      .insert(serpapiImportRuns)
      .values({
        status: "done",
        initiatedByUserId: userId,
        cityId,
        nicheId,
        query: "manual_upload",
        dryRun: false,
      })
      .returning({ id: serpapiImportRuns.id });
    const runId = run?.id ?? "";

    await db.insert(serpapiImportRecords).values([
      {
        runId,
        rawPayload: JSON.stringify(rawRecord("Empresa Niche Record", "15999995555", "Rua Niche, 1")),
        normalizedPayload: {
          name: "Empresa Niche Record",
          phone: "15999995555",
          address: "Rua Niche, 1",
          niche: "Nicho Alternativo",
        },
        dedupeKey: `key-${Date.now()}-rec`,
        status: "conflict",
        cityId,
        nicheId: nicheIdAlt,
      },
      {
        runId,
        rawPayload: JSON.stringify(rawRecord("Empresa Niche Run", "15999996666", "Rua Run, 2")),
        normalizedPayload: {
          name: "Empresa Niche Run",
          phone: "15999996666",
          address: "Rua Run, 2",
          niche: null,
        },
        dedupeKey: `key-${Date.now()}-run`,
        status: "conflict",
        cityId,
        nicheId: null,
      },
    ]);

    const response = await app.inject({
      method: "POST",
      url: `/admin/serpapi/runs/${runId}/publish`,
      headers: { authorization: `Bearer ${token}` },
      payload: { force: false },
    });

    expect(response.statusCode).toBe(200);

    const [companyRecord] = await db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.tradeName, "Empresa Niche Record"))
      .limit(1);
    expect(companyRecord?.id).toBeTruthy();

    const linksRecord = await db
      .select({ nicheId: companyNiches.nicheId })
      .from(companyNiches)
      .where(eq(companyNiches.companyId, companyRecord?.id ?? ""));
    const recordNicheIds = linksRecord.map((link) => link.nicheId);
    expect(recordNicheIds).toContain(nicheIdAlt);

    const [companyRun] = await db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.tradeName, "Empresa Niche Run"))
      .limit(1);
    expect(companyRun?.id).toBeTruthy();

    const linksRun = await db
      .select({ nicheId: companyNiches.nicheId })
      .from(companyNiches)
      .where(eq(companyNiches.companyId, companyRun?.id ?? ""));
    const runNicheIds = linksRun.map((link) => link.nicheId);
    expect(runNicheIds).toContain(nicheId);
  });

  it("marks error when neither record nor run has niche_id", async () => {
    const [run] = await db
      .insert(serpapiImportRuns)
      .values({
        status: "done",
        initiatedByUserId: userId,
        cityId,
        nicheId: null,
        query: "manual_upload",
        dryRun: false,
      })
      .returning({ id: serpapiImportRuns.id });
    const runId = run?.id ?? "";

    await db.insert(serpapiImportRecords).values([
      {
        runId,
        rawPayload: JSON.stringify(rawRecord("Empresa Sem Nicho", "15999997777", "Rua X, 3")),
        normalizedPayload: {
          name: "Empresa Sem Nicho",
          phone: "15999997777",
          address: "Rua X, 3",
          niche: null,
        },
        dedupeKey: `key-${Date.now()}-err`,
        status: "conflict",
        cityId,
        nicheId: null,
      },
    ]);

    const response = await app.inject({
      method: "POST",
      url: `/admin/serpapi/runs/${runId}/publish`,
      headers: { authorization: `Bearer ${token}` },
      payload: { force: false },
    });

    expect(response.statusCode).toBe(200);
    const payload = JSON.parse(response.payload) as { inserted: number; skipped: number };
    expect(payload.inserted).toBe(0);
    expect(payload.skipped).toBe(1);
  });
});
