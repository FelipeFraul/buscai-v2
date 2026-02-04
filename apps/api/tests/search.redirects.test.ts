import fastify from "fastify";
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { registerRoutes } from "../src/core/http/router";
import { db } from "../src/core/database/client";
import { cities, niches } from "../src/modules/catalog/catalog.schema";
import { searches } from "../src/modules/search/search.schema";
import { searchEvents } from "../src/modules/search/search.schema";
import { users } from "../src/modules/auth/auth.schema";
import { companies } from "../src/modules/companies/companies.schema";

describe("Search redirect links", () => {
  let app: ReturnType<typeof fastify>;
  let searchId: string;
  let companyId: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? "secret-secret-secret-123456";
    process.env.REFRESH_SECRET = process.env.REFRESH_SECRET ?? "refresh-secret-456789";
    process.env.WHATSAPP_API_URL = "http://localhost";
    process.env.WHATSAPP_API_TOKEN = "token-for-tests-123456789";
    process.env.WHATSAPP_WEBHOOK_SECRET = "webhook-secret-123456";
    process.env.CLAIM_SUPPORT_WHATSAPP = process.env.CLAIM_SUPPORT_WHATSAPP ?? "5515999999999";
    process.env.SERPAPI_API_KEY = process.env.SERPAPI_API_KEY ?? "serpapi-test-key";
    process.env.DATABASE_URL =
      process.env.DATABASE_URL ?? "postgres://buscai:buscai@localhost:5433/buscai";

    app = fastify();
    await registerRoutes(app);
    await app.ready();

    const [city] = await db.select({ id: cities.id }).from(cities).limit(1);
    const [niche] = await db.select({ id: niches.id }).from(niches).limit(1);
    const cityId =
      city?.id ??
      (
        await db
          .insert(cities)
          .values({ name: "Cidade Redirect", state: "SP", isActive: true })
          .returning({ id: cities.id })
      )[0]?.id;
    const nicheId =
      niche?.id ??
      (
        await db
          .insert(niches)
          .values({ slug: `niche-redirect-${Date.now()}`, label: "Nicho Redirect", isActive: true })
          .returning({ id: niches.id })
      )[0]?.id;

    const [createdSearch] = await db
      .insert(searches)
      .values({
        queryText: "redirect",
        cityId: cityId ?? "00000000-0000-0000-0000-000000000001",
        nicheId: nicheId ?? "00000000-0000-0000-0000-000000000002",
        source: "web",
      })
      .returning({ id: searches.id });
    searchId = createdSearch?.id ?? "00000000-0000-0000-0000-000000000003";

    const [user] = await db
      .insert(users)
      .values({
        name: "Owner Redirect",
        email: `owner-redirect-${Date.now()}@local`,
        passwordHash: "hash",
        role: "company_owner",
      })
      .returning({ id: users.id });

    const [company] = await db
      .insert(companies)
      .values({
        ownerId: user?.id ?? "00000000-0000-0000-0000-000000000004",
        tradeName: "Empresa Redirect",
        cityId: cityId ?? "00000000-0000-0000-0000-000000000001",
        phone: "+551133333333",
        whatsapp: "+5511999999999",
        status: "active",
      })
      .returning({ id: companies.id });
    companyId = company?.id ?? "00000000-0000-0000-0000-000000000005";
  });

  it("redirects to wa.me and records click_whatsapp", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/r/w/${searchId}/${companyId}`,
    });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain("https://wa.me/");

    const events = await db
      .select()
      .from(searchEvents)
      .where(eq(searchEvents.searchId, searchId));
    const clicks = events.filter((row) => row.type === "click_whatsapp");
    expect(clicks.length).toBeGreaterThan(0);
  });

  it("redirects to tel and records click_call (no dedupe)", async () => {
    const first = await app.inject({
      method: "GET",
      url: `/r/c/${searchId}/${companyId}`,
    });
    const second = await app.inject({
      method: "GET",
      url: `/r/c/${searchId}/${companyId}`,
    });

    expect(first.statusCode).toBe(302);
    expect(second.statusCode).toBe(302);
    expect(first.headers.location).toContain("tel:+");

    const events = await db
      .select()
      .from(searchEvents)
      .where(eq(searchEvents.searchId, searchId));
    const clicks = events.filter((row) => row.type === "click_call");
    expect(clicks.length).toBeGreaterThanOrEqual(2);
  });
});
