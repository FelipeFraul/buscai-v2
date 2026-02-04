import fastify from "fastify";
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { registerRoutes } from "../src/core/http/router";
import { signAccessToken } from "../src/core/auth/jwt";
import { db } from "../src/core/database/client";
import { cities, niches } from "../src/modules/catalog/catalog.schema";
import { serpapiImportRecords, serpapiImportRuns } from "../src/modules/serpapi/serpapi.schema";
import { users } from "../src/modules/auth/auth.schema";

describe("Serpapi manual import", () => {
  let app: ReturnType<typeof fastify>;
  let token: string;
  let cityId: string;
  let cityName: string;
  let cityState: string;
  let nicheId: string;
  let nicheLabel: string;

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
        name: "Admin Test",
        email: `admin-serpapi-manual-${Date.now()}@local`,
        passwordHash: "hash",
        role: "admin",
      })
      .returning({ id: users.id });
    const userId = created?.id ?? "00000000-0000-0000-0000-000000000002";
    token = signAccessToken({ id: userId, role: "admin" });

    const [city] = await db
      .select({ id: cities.id, name: cities.name, state: cities.state })
      .from(cities)
      .limit(1);
    if (!city?.id) {
      const [createdCity] = await db
        .insert(cities)
        .values({ name: "Cidade Teste", state: "SP", isActive: true })
        .returning({ id: cities.id, name: cities.name, state: cities.state });
      cityId = createdCity?.id ?? "00000000-0000-0000-0000-000000000001";
      cityName = createdCity?.name ?? "Cidade Teste";
      cityState = createdCity?.state ?? "SP";
    } else {
      cityId = city.id;
      cityName = city.name;
      cityState = city.state;
    }

    const [niche] = await db
      .select({ id: niches.id, label: niches.label })
      .from(niches)
      .limit(1);
    if (!niche?.id) {
      const [createdNiche] = await db
        .insert(niches)
        .values({ slug: `niche-${Date.now()}`, label: "Nicho Teste", isActive: true })
        .returning({ id: niches.id, label: niches.label });
      nicheId = createdNiche?.id ?? "00000000-0000-0000-0000-000000000002";
      nicheLabel = createdNiche?.label ?? "Nicho Teste";
    } else {
      nicheId = niche.id;
      nicheLabel = niche.label;
    }
  });

  it("creates run and records with resolved city/niche", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/admin/serpapi/import-manual",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        fixedCityId: cityId,
        fixedNicheId: nicheId,
        mapping: {
          name: "nome",
          phone: "telefone",
          address: "endereco",
          city: "cidade",
          niche: "nicho",
          source: "origem",
        },
        rows: [
          {
            nome: "Empresa Manual 1",
            telefone: "15999990000",
            endereco: "Rua A, 10",
            cidade: `${cityName} - ${cityState}`,
            nicho: nicheLabel,
            origem: "manual_upload",
          },
          {
            nome: "Empresa Manual 2",
            telefone: "15999990001",
            endereco: "Rua B, 20",
            cidade: `${cityName} - ${cityState}`,
            nicho: nicheLabel,
            origem: "manual_upload",
          },
        ],
        options: { dryRun: false },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload) as { runId: string };
    expect(body.runId).toBeTruthy();

    const [run] = await db
      .select({ cityId: serpapiImportRuns.cityId, nicheId: serpapiImportRuns.nicheId })
      .from(serpapiImportRuns)
      .where(eq(serpapiImportRuns.id, body.runId))
      .limit(1);

    expect(run?.cityId).toBeTruthy();
    expect(run?.nicheId).toBeTruthy();

    const [record] = await db
      .select({ cityId: serpapiImportRecords.cityId, nicheId: serpapiImportRecords.nicheId })
      .from(serpapiImportRecords)
      .where(eq(serpapiImportRecords.runId, body.runId))
      .limit(1);

    expect(record?.cityId).toBeTruthy();
    expect(record?.nicheId).toBeTruthy();
  });

  it("returns 400 when city mapping is missing and no fixedCityId", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/admin/serpapi/import-manual",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        fixedNicheId: nicheId,
        mapping: {
          name: "nome",
          phone: "telefone",
          address: "endereco",
          niche: "nicho",
        },
        rows: [
          {
            nome: "Empresa Manual 3",
            telefone: "15999990002",
            endereco: "Rua C, 30",
            nicho: nicheLabel,
          },
        ],
        options: { dryRun: false },
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 400 when niche mapping is missing and no fixedNicheId", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/admin/serpapi/import-manual",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        fixedCityId: cityId,
        mapping: {
          name: "nome",
          phone: "telefone",
          address: "endereco",
          city: "cidade",
        },
        rows: [
          {
            nome: "Empresa Manual 4",
            telefone: "15999990003",
            endereco: "Rua D, 40",
            cidade: `${cityName} - ${cityState}`,
          },
        ],
        options: { dryRun: false },
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 400 with report when niche is unknown", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/admin/serpapi/import-manual",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        fixedCityId: cityId,
        mapping: {
          name: "nome",
          phone: "telefone",
          address: "endereco",
          niche: "nicho",
        },
        rows: [
          {
            nome: "Empresa Manual 5",
            telefone: "15999990004",
            endereco: "Rua E, 50",
            nicho: "Nicho Que Nao Existe",
          },
        ],
        options: { dryRun: false },
      },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.payload) as {
      message?: string;
      unknownNiches?: Array<{
        labelOriginal: string;
        labelNormalizado: string;
        count: number;
        examples: string[];
      }>;
    };
    expect(body.message).toBe("unknown_niches");
    expect(body.unknownNiches?.length).toBe(1);
    expect(body.unknownNiches?.[0].labelOriginal).toBe("Nicho Que Nao Existe");
    expect(body.unknownNiches?.[0].count).toBe(1);
  });
});
