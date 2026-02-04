import { randomUUID } from "node:crypto";

import fastify from "fastify";
import { beforeAll, describe, expect, it } from "vitest";

import { registerRoutes } from "../src/core/http/router";
import { signAccessToken } from "../src/core/auth/jwt";
import { db } from "../src/core/database/client";
import { users } from "../src/modules/auth/auth.schema";
import { auctionConfigs } from "../src/modules/auction/auction.schema";
import { cities, niches } from "../src/modules/catalog/catalog.schema";
import { companies, companyNiches } from "../src/modules/companies/companies.schema";

describe("Auction slots response", () => {
  let app: ReturnType<typeof fastify>;
  let token: string;
  let cityId: string;
  let nicheId: string;
  let companyId: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? "secret-secret-secret-123456";
    process.env.REFRESH_SECRET = process.env.REFRESH_SECRET ?? "refresh-secret-456789";
    process.env.WHATSAPP_API_URL = "http://localhost";
    process.env.WHATSAPP_API_TOKEN = "token-for-tests-123456789";
    process.env.WHATSAPP_WEBHOOK_SECRET = "webhook-secret-123456";
    process.env.WHATSAPP_DEFAULT_CITY_ID = "00000000-0000-0000-0000-000000000000";
    process.env.WHATSAPP_DEFAULT_NICHE_ID = "00000000-0000-0000-0000-000000000000";
    process.env.DATABASE_URL =
      process.env.DATABASE_URL ?? "postgres://buscai:buscai@localhost:5433/buscai";

    app = fastify();
    await registerRoutes(app);
    await app.ready();

    const ownerId = randomUUID();
    const [owner] = await db
      .insert(users)
      .values({
        id: ownerId,
        name: "Owner Slots",
        email: `owner-slots-${Date.now()}@buscai.local`,
        passwordHash: "hash",
        role: "company_owner",
      })
      .returning();

    const [city] = await db
      .insert(cities)
      .values({ name: `Cidade ${Date.now()}`, state: "SP", isActive: true })
      .returning();
    cityId = city.id;

    const [niche] = await db
      .insert(niches)
      .values({ slug: `niche-${Date.now()}`, label: "Nicho Slots", isActive: true })
      .returning();
    nicheId = niche.id;

    const [company] = await db
      .insert(companies)
      .values({
        ownerId: owner.id,
        tradeName: "Empresa Slots",
        legalName: "Empresa Slots LTDA",
        cityId,
        status: "active",
      })
      .returning();
    companyId = company.id;

    await db
      .insert(companyNiches)
      .values({ companyId, nicheId });

    await db
      .insert(auctionConfigs)
      .values({
        companyId,
        cityId,
        nicheId,
        mode: "manual",
        bidPosition1: "300",
        bidPosition2: null,
        bidPosition3: null,
        isActive: true,
      });

    token = signAccessToken({ id: owner.id, role: "company_owner", companyId });
  });

  it("returns companyName for winning slot positions", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/auction/slots",
      headers: { authorization: `Bearer ${token}` },
      query: { cityId, nicheId },
    });

    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(res.payload);
    const slot1 = payload?.slots?.find((slot: any) => slot.position === 1);
    expect(slot1?.companyName).toBe("Empresa Slots");
    expect(slot1?.companyId).toBe(companyId);
  });
});
