import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createServer } from "../../src/core/http/server";
import { db } from "../../src/core/database/client";
import { users } from "../../src/modules/auth/auth.schema";
import { billingWallets } from "../../src/modules/billing/billing.schema";
import { cities, niches } from "../../src/modules/catalog/catalog.schema";
import { companies, companyNiches } from "../../src/modules/companies/companies.schema";
import { auctionConfigs } from "../../src/modules/auction/auction.schema";

let app: FastifyInstance;
let authHeaders: Record<string, string> = {};
let companyContext: { cityId: string; nicheId: string; companyId: string } | null = null;

async function ensureDemoFixtures() {
  const email = "demo@buscai.app";
  const password = "demo123";

  let [city] = await db.select().from(cities).limit(1);
  if (!city) {
    [city] = await db
      .insert(cities)
      .values({ name: "Cidade Demo", state: "SP", isActive: true })
      .returning();
  }

  let [niche] = await db.select().from(niches).limit(1);
  if (!niche) {
    [niche] = await db
      .insert(niches)
      .values({ slug: "geral", label: "Geral", isActive: true })
      .returning();
  }

  let [owner] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!owner) {
    const hash = await bcrypt.hash(password, 10);
    [owner] = await db
      .insert(users)
      .values({ name: "Demo Owner", email, passwordHash: hash, role: "company_owner" })
      .returning();
  } else {
    const hash = await bcrypt.hash(password, 10);
    [owner] = await db
      .update(users)
      .set({ passwordHash: hash })
      .where(eq(users.id, owner.id))
      .returning();
  }

  let [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.ownerId, owner.id))
    .limit(1);
  if (!company) {
    [company] = await db
      .insert(companies)
      .values({
        ownerId: owner.id,
        tradeName: "Empresa Demo LTDA",
        legalName: "Empresa Demo LTDA",
        cityId: city.id,
        status: "active",
      })
      .returning();
  }

  const [cn] = await db
    .select()
    .from(companyNiches)
    .where(eq(companyNiches.companyId, company.id))
    .limit(1);
  if (!cn) {
    await db.insert(companyNiches).values({ companyId: company.id, nicheId: niche.id });
  }

  const [wallet] = await db
    .select()
    .from(billingWallets)
    .where(eq(billingWallets.companyId, company.id))
    .limit(1);
  if (!wallet) {
    await db
      .insert(billingWallets)
      .values({ companyId: company.id, balance: "0", reserved: "0" });
  }

  return { email, password, companyId: company.id, cityId: city.id, nicheId: niche.id };
}

describe("E2E search flow", () => {
  beforeAll(async () => {
    const seed = await ensureDemoFixtures();
    app = await createServer();
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: seed.email, password: seed.password },
    });
    expect(login.statusCode).toBeLessThan(500);
    const token = login.json()?.accessToken;
    expect(token).toBeTruthy();
    authHeaders = { authorization: `Bearer ${token}` };
    companyContext = { companyId: seed.companyId, cityId: seed.cityId, nicheId: seed.nicheId };
  });

  afterAll(async () => {
    await app.close();
  });

  it("runs core endpoints without 500", async () => {
    const companies = await app.inject({ method: "GET", url: "/companies", headers: authHeaders });
    expect(companies.statusCode).toBeLessThan(500);

    const auctionConfigs = await app.inject({
      method: "GET",
      url: "/auction/configs",
      headers: authHeaders,
    });
    expect(auctionConfigs.statusCode).toBeLessThan(500);

    const wallet = await app.inject({
      method: "GET",
      url: "/billing/wallet",
      headers: authHeaders,
      query: { companyId: companyContext?.companyId },
    });
    expect(wallet.statusCode).toBeLessThan(500);

    const search = await app.inject({
      method: "POST",
      url: "/search",
      payload: {
        cityId: companyContext?.cityId ?? "",
        nicheId: companyContext?.nicheId ?? "",
        query: "teste",
      },
    });
    expect(search.statusCode).toBeLessThan(500);

    const productSearch = await app.inject({
      method: "POST",
      url: "/search/products",
      payload: {
        cityId: companyContext?.cityId ?? "",
        nicheId: companyContext?.nicheId ?? "",
        query: "produto",
      },
    });
    expect(productSearch.statusCode).toBeLessThan(500);

    const analytics = await app.inject({ method: "GET", url: "/analytics/searches" });
    expect(analytics.statusCode).toBeLessThan(500);

    const webhook = await app.inject({
      method: "POST",
      url: "/integrations/whatsapp/webhook",
      payload: {
        object: "whatsapp_business_account",
        entry: [
          {
            id: "entry-id",
            changes: [
              {
                value: {
                  messages: [
                    {
                      from: "5511999999999",
                      id: "wamid.TEST",
                      timestamp: "123456",
                      type: "text",
                      text: { body: "ajuda" },
                    },
                  ],
                  metadata: {
                    phone_number_id: "phone-id",
                  },
                },
              },
            ],
          },
        ],
      },
      headers: {
        "x-webhook-secret":
          process.env.WHATSAPP_WEBHOOK_SECRET ?? "somewebhooksecret999999",
      },
    });
    expect(webhook.statusCode).toBeLessThan(500);
  });

  it("uses auto floors when market is empty", async () => {
    if (!companyContext) {
      throw new Error("missing company context");
    }

    await db
      .delete(auctionConfigs)
      .where(
        and(
          eq(auctionConfigs.cityId, companyContext.cityId),
          eq(auctionConfigs.nicheId, companyContext.nicheId)
        )
      );

    const [config] = await db
      .insert(auctionConfigs)
      .values({
        companyId: companyContext.companyId,
        cityId: companyContext.cityId,
        nicheId: companyContext.nicheId,
        mode: "auto",
        targetPosition: 1,
        dailyBudget: null,
        pauseOnLimit: true,
        isActive: true,
      })
      .returning();

    const search = await app.inject({
      method: "POST",
      url: "/search",
      payload: {
        cityId: companyContext.cityId,
        nicheId: companyContext.nicheId,
        query: "teste leilao",
      },
    });

    expect(search.statusCode).toBe(200);
    const payload = search.json();
    const paid = payload?.results?.find((item: any) => item.isPaid);
    expect(paid?.position).toBe(1);
    expect(paid?.chargedAmount).toBe(350);

    if (config?.id) {
      await db.delete(auctionConfigs).where(eq(auctionConfigs.id, config.id));
    }
  });
});
