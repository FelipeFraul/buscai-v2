import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import { and, eq, ne } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createServer } from "../../src/core/http/server";
import { db } from "../../src/core/database/client";
import { users } from "../../src/modules/auth/auth.schema";
import { billingWallets } from "../../src/modules/billing/billing.schema";
import { auctionConfigs } from "../../src/modules/auction/auction.schema";
import { cities, niches } from "../../src/modules/catalog/catalog.schema";
import { companies, companyNiches } from "../../src/modules/companies/companies.schema";
import { searchResults } from "../../src/modules/search/search.schema";

let app: FastifyInstance;
let authHeaders: Record<string, string> = {};
let seedData: { companyId: string; cityId: string; nicheId: string } | null = null;

async function ensureDemoFixtures() {
  const email = "demo@buscai.app";
  const password = "demo123";
  const adminEmail = "admin@buscai.app";
  const adminPassword = "admin123";

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

  let [adminUser] = await db.select().from(users).where(eq(users.email, adminEmail)).limit(1);
  if (!adminUser) {
    const hash = await bcrypt.hash(adminPassword, 10);
    [adminUser] = await db
      .insert(users)
      .values({ name: "Admin", email: adminEmail, passwordHash: hash, role: "admin" })
      .returning();
  } else {
    const hash = await bcrypt.hash(adminPassword, 10);
    [adminUser] = await db
      .update(users)
      .set({ passwordHash: hash })
      .where(eq(users.id, adminUser.id))
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
        phone: "+551133333333",
        whatsapp: "+5511999999999",
        status: "active",
      })
      .returning();
  } else if (!company.phone || !company.whatsapp) {
    [company] = await db
      .update(companies)
      .set({
        phone: company.phone ?? "+551133333333",
        whatsapp: company.whatsapp ?? "+5511999999999",
      })
      .where(eq(companies.id, company.id))
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

  return {
    email,
    password,
    adminEmail,
    adminPassword,
    companyId: company.id,
    cityId: city.id,
    nicheId: niche.id,
  };
}

describe("E2E billing + auction + search + analytics", () => {
  beforeAll(async () => {
    const seed = await ensureDemoFixtures();
    const fixtures = await ensureDemoFixtures();
    seedData = {
      companyId: fixtures.companyId,
      cityId: fixtures.cityId,
      nicheId: fixtures.nicheId,
    };
    app = await createServer();

    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: process.env.ADMIN_USER_EMAIL ?? fixtures.adminEmail,
        password: process.env.ADMIN_USER_PASSWORD ?? fixtures.adminPassword,
      },
    });

    expect(res.statusCode).toBe(200);
    const token = res.json()?.accessToken;
    expect(token).toBeTruthy();
    authHeaders = { authorization: `Bearer ${token}` };
  });

  afterAll(async () => {
    await app.close();
  });

  it("runs recharge -> auction -> search -> debit -> click -> analytics", async () => {
    const companyId = seedData?.companyId;
    const cityId = seedData?.cityId;
    const nicheId = seedData?.nicheId;
    expect(companyId).toBeTruthy();
    expect(cityId).toBeTruthy();
    expect(nicheId).toBeTruthy();

    const walletBefore = await app.inject({
      method: "GET",
      url: "/billing/wallet",
      headers: authHeaders,
      query: { companyId },
    });
    expect(walletBefore.statusCode).toBe(200);
    const walletBeforeData = walletBefore.json();
    const balanceBefore =
      walletBeforeData?.balance ?? walletBeforeData?.balanceCents ?? 0;

    const recharge = await app.inject({
      method: "POST",
      url: "/billing/recharges",
      headers: authHeaders,
      query: { companyId },
      payload: { companyId, amount: 1000 },
    });
    expect([200, 201]).toContain(recharge.statusCode);
    const rechargeData = recharge.json();
    const rechargeId = rechargeData?.id ?? rechargeData?.rechargeId;
    expect(rechargeId).toBeTruthy();

    const confirm = await app.inject({
      method: "POST",
      url: `/billing/recharges/${rechargeId}/confirm`,
      headers: authHeaders,
    });
    expect(confirm.statusCode).toBe(200);

    const walletAfterRecharge = await app.inject({
      method: "GET",
      url: "/billing/wallet",
      headers: authHeaders,
      query: { companyId },
    });
    const walletAfterRechargeData = walletAfterRecharge.json();
    const balanceAfterRecharge =
      walletAfterRechargeData?.balance ?? walletAfterRechargeData?.balanceCents ?? 0;
    expect(balanceAfterRecharge).toBeGreaterThan(balanceBefore);

    await db
      .delete(auctionConfigs)
      .where(
        and(
          eq(auctionConfigs.cityId, cityId as string),
          eq(auctionConfigs.nicheId, nicheId as string),
          ne(auctionConfigs.companyId, companyId as string)
        )
      );

    const auction = await app.inject({
      method: "POST",
      url: "/auction/configs",
      headers: authHeaders,
      payload: {
        companyId,
        cityId,
        nicheId,
        mode: "manual",
        bids: { position1: 300 },
      },
    });
    expect(auction.statusCode).toBe(200);
    expect(auction.json()?.companyId).toBe(companyId);

    const search = await app.inject({
      method: "POST",
      url: "/search",
      payload: { cityId, nicheId, query: "teste", source: "whatsapp" },
    });
    expect(search.statusCode).toBe(200);
    const searchData = search.json();
    const searchId = searchData?.searchId;
    expect(searchId).toBeTruthy();
    const paid = (searchData?.results ?? []).filter((r: any) => r.isPaid);
    expect(paid.length).toBeGreaterThan(0);
    const paidResult = paid[0];
    const chargedAmount = Number(paidResult.chargedAmount ?? 0);
    const effectiveCharge = chargedAmount > 0 ? chargedAmount : 1;

    const walletAfterSearch = await app.inject({
      method: "GET",
      url: "/billing/wallet",
      headers: authHeaders,
      query: { companyId },
    });
    const walletAfterSearchData = walletAfterSearch.json();
    const balanceAfterSearch =
      walletAfterSearchData?.balance ?? walletAfterSearchData?.balanceCents ?? 0;
    expect(balanceAfterRecharge - balanceAfterSearch).toBeGreaterThanOrEqual(effectiveCharge);

    const [resultRow] = await db
      .select()
      .from(searchResults)
      .where(eq(searchResults.searchId, searchId as string));
    const resultId = resultRow?.id;
    expect(resultId).toBeTruthy();

    const click = await app.inject({
      method: "POST",
      url: `/search/${searchId}/click`,
      payload: {
        resultId,
        channelType: "whatsapp",
      },
    });
    expect(click.statusCode).toBe(204);

    const contacts = await app.inject({
      method: "GET",
      url: `/companies/${companyId}/contacts`,
      headers: authHeaders,
      query: { classification: "null" },
    });
    expect(contacts.statusCode).toBe(200);
    expect((contacts.json()?.items ?? []).length).toBeGreaterThan(0);

    const redirect = await app.inject({
      method: "GET",
      url: `/r/w/${searchId}/${paidResult.company.id}`,
    });
    expect(redirect.statusCode).toBe(302);

    const walletAfterClick = await app.inject({
      method: "GET",
      url: "/billing/wallet",
      headers: authHeaders,
      query: { companyId },
    });
    const walletAfterClickData = walletAfterClick.json();
    const balanceAfterClick =
      walletAfterClickData?.balance ?? walletAfterClickData?.balanceCents ?? 0;
    expect(balanceAfterClick).toBe(balanceAfterSearch);

    const dashboardAfter = await app.inject({
      method: "GET",
      url: "/analytics/dashboard",
      headers: authHeaders,
      query: { companyId },
    });
    const dashboardAfterData = dashboardAfter.json();
    expect(dashboardAfterData?.moment?.contactsToday).toBeGreaterThanOrEqual(1);
    expect(dashboardAfterData?.moment?.creditsSpentToday).toBeGreaterThanOrEqual(0);

    const walletFinalRes = await app.inject({
      method: "GET",
      url: "/billing/wallet",
      headers: authHeaders,
      query: { companyId },
    });
    expect(walletFinalRes.statusCode).toBe(200);
    const walletFinalData = walletFinalRes.json();
    const walletFinal =
      walletFinalData?.balance ?? walletFinalData?.balanceCents ?? 0;
    expect(walletFinal).toBe(balanceAfterClick);
  });
});
