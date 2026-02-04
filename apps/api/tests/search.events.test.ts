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

describe("Search events", () => {
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
    process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgres://buscai:buscai@localhost:5433/buscai";

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
          .values({ name: "Cidade Evento", state: "SP", isActive: true })
          .returning({ id: cities.id })
      )[0]?.id;
    const nicheId =
      niche?.id ??
      (
        await db
          .insert(niches)
          .values({ slug: `niche-event-${Date.now()}`, label: "Nicho Evento", isActive: true })
          .returning({ id: niches.id })
      )[0]?.id;

    const [createdSearch] = await db
      .insert(searches)
      .values({
        queryText: "evento",
        cityId: cityId ?? "00000000-0000-0000-0000-000000000001",
        nicheId: nicheId ?? "00000000-0000-0000-0000-000000000002",
        source: "web",
      })
      .returning({ id: searches.id });
    searchId = createdSearch?.id ?? "00000000-0000-0000-0000-000000000003";

    const [user] = await db
      .insert(users)
      .values({
        name: "Owner Evento",
        email: `owner-event-${Date.now()}@local`,
        passwordHash: "hash",
        role: "company_owner",
      })
      .returning({ id: users.id });

    const [company] = await db
      .insert(companies)
      .values({
        ownerId: user?.id ?? "00000000-0000-0000-0000-000000000004",
        tradeName: "Empresa Evento",
        cityId: cityId ?? "00000000-0000-0000-0000-000000000001",
        status: "active",
      })
      .returning({ id: companies.id });
    companyId = company?.id ?? "00000000-0000-0000-0000-000000000005";
  });

  it("dedupes impression by searchId", async () => {
    const first = await app.inject({
      method: "POST",
      url: `/search/${searchId}/events`,
      payload: { type: "impression" },
    });
    const second = await app.inject({
      method: "POST",
      url: `/search/${searchId}/events`,
      payload: { type: "impression" },
    });

    expect([204, 200]).toContain(first.statusCode);
    expect([204, 200]).toContain(second.statusCode);

    const rows = await db
      .select()
      .from(searchEvents)
      .where(eq(searchEvents.searchId, searchId));
    const impressions = rows.filter((row) => row.type === "impression");
    expect(impressions.length).toBe(1);
  });

  it("requires companyId for click events", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/search/${searchId}/events`,
      payload: { type: "click_whatsapp" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("records click events with companyId", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/search/${searchId}/events`,
      payload: { type: "click_call", companyId },
    });
    expect([204, 200]).toContain(res.statusCode);
  });
});
