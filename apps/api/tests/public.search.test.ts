import fastify from "fastify";
import { beforeAll, describe, expect, it } from "vitest";

import { registerRoutes } from "../src/core/http/router";
import { db } from "../src/core/database/client";
import { cities, niches } from "../src/modules/catalog/catalog.schema";

describe("Public search", () => {
  let app: ReturnType<typeof fastify>;
  let cityName: string;
  let nicheLabel: string;

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

    const [city] = await db.select({ name: cities.name }).from(cities).limit(1);
    if (city?.name) {
      cityName = city.name;
    } else {
      const [createdCity] = await db
        .insert(cities)
        .values({ name: "Itapetininga", state: "SP", isActive: true })
        .returning({ name: cities.name });
      cityName = createdCity?.name ?? "Itapetininga";
    }

    const [niche] = await db.select({ label: niches.label }).from(niches).limit(1);
    if (niche?.label) {
      nicheLabel = niche.label;
    } else {
      const [createdNiche] = await db
        .insert(niches)
        .values({ slug: `niche-${Date.now()}`, label: "Dentista", isActive: true })
        .returning({ label: niches.label });
      nicheLabel = createdNiche?.label ?? "Dentista";
    }
  });

  it("resolves city and niche and returns results", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/public/search",
      payload: {
        text: "dentista",
        city: cityName,
        niche: nicheLabel,
        limit: 7,
      },
    });

    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(res.payload);
    expect(payload.searchId).toBeTruthy();
    expect(Array.isArray(payload.results)).toBe(true);
    if (payload.offeredBy != null) {
      expect(payload.offeredBy.text).toBeTruthy();
    }
  });
});
