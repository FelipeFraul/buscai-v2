import { describe, expect, it, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { db } from "./src/core/database/client";
import { billingTransactions, billingWallets } from "./src/modules/billing/billing.schema";
import { getPaymentGateway } from "./src/modules/billing/gateway/gateway-factory";
import { BillingRepository } from "./src/modules/billing/billing.repository";
import { users } from "./src/modules/auth/auth.schema";
import { cities } from "./src/modules/catalog/catalog.schema";
import { companies } from "./src/modules/companies/companies.schema";
import { productPlans } from "./src/modules/products/products.schema";
import { ProductsRepository } from "./src/modules/products/products.repository";
import { subscriptions, paymentMethods } from "./src/modules/subscriptions/subscriptions.schema";
import { SubscriptionsRepository } from "./src/modules/subscriptions/subscriptions.repository";
import { SubscriptionsService } from "./src/modules/subscriptions/subscriptions.service";

const now = new Date("2026-01-10T00:00:00.000Z");

async function createCompany() {
  const ownerId = await createUser();
  const cityId = await createCity();
  const [company] = await db
    .insert(companies)
    .values({
      ownerId,
      tradeName: `Empresa Sub ${Date.now()}`,
      cityId,
      status: "active",
    })
    .returning({ id: companies.id });
  return company?.id ?? "00000000-0000-0000-0000-000000000003";
}

async function createUser() {
  const nonce = randomUUID();
  const [user] = await db
    .insert(users)
    .values({
      name: `User ${nonce}`,
      email: `user-${nonce}@example.com`,
      passwordHash: "hash",
      role: "company_owner",
    })
    .returning({ id: users.id });
  return user?.id ?? "00000000-0000-0000-0000-000000000001";
}

async function createCity() {
  const nonce = randomUUID();
  const [city] = await db
    .insert(cities)
    .values({
      name: `Cidade ${nonce}`,
      state: "SP",
      isActive: true,
    })
    .returning({ id: cities.id });
  return city?.id ?? "00000000-0000-0000-0000-000000000002";
}

async function createPlan(priceCents: number) {
  const [plan] = await db
    .insert(productPlans)
    .values({
      name: `Plano ${priceCents}`,
      description: "Plano teste",
      monthlyPriceCents: priceCents,
      maxActiveOffers: 10,
      isActive: true,
    })
    .returning({ id: productPlans.id });
  return plan?.id ?? "00000000-0000-0000-0000-000000000004";
}

async function createSubscription(params: {
  companyId: string;
  planId: string;
  periodStart: Date;
  periodEnd: Date;
  status?: "active" | "past_due";
  scheduledPlanId?: string | null;
}) {
  const [row] = await db
    .insert(subscriptions)
    .values({
      companyId: params.companyId,
      planId: params.planId,
      status: params.status ?? "active",
      currentPeriodStart: params.periodStart,
      currentPeriodEnd: params.periodEnd,
      scheduledPlanId: params.scheduledPlanId ?? null,
    })
    .returning();
  return row;
}

async function createPaymentMethod(params: {
  companyId: string;
  provider?: "dummy";
}) {
  await db.insert(paymentMethods).values({
    companyId: params.companyId,
    provider: params.provider ?? "dummy",
    customerId: "cus_dummy",
    paymentMethodId: "pm_dummy",
    status: "active",
  });
}

async function seedWallet(companyId: string, balance: number) {
  await db.insert(billingWallets).values({
    companyId,
    balance: balance.toString(),
    reserved: "0",
  });
}

function createService() {
  const subscriptionsRepository = new SubscriptionsRepository();
  const productsRepository = new ProductsRepository();
  const billingRepository = new BillingRepository();
  const gateway = getPaymentGateway();
  return new SubscriptionsService(
    subscriptionsRepository,
    productsRepository,
    billingRepository,
    gateway
  );
}

beforeAll(() => {
  process.env.PAYMENT_PROVIDER = "dummy";
  process.env.DUMMY_GATEWAY_ALWAYS_APPROVE = "true";
});

describe("subscription renewal", () => {
  it("renews via card when token exists", async () => {
    const companyId = await createCompany();
    const planId = await createPlan(500);
    await createPaymentMethod({ companyId });
    await createSubscription({
      companyId,
      planId,
      periodStart: new Date("2025-12-10T00:00:00.000Z"),
      periodEnd: now,
    });

    const service = createService();
    await service.renewDueSubscriptions(now);

    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.companyId, companyId));
    expect(sub?.status).toBe("active");
    expect(sub?.currentPeriodStart?.toISOString()).toBe(now.toISOString());

    const transactions = await db
      .select()
      .from(billingTransactions)
      .where(eq(billingTransactions.companyId, companyId));
    expect(transactions.some((t) => t.type === "subscription_renewal")).toBe(true);
  });

  it("idempotency: running twice does not duplicate charge", async () => {
    const companyId = await createCompany();
    const planId = await createPlan(800);
    await createPaymentMethod({ companyId });
    await createSubscription({
      companyId,
      planId,
      periodStart: new Date("2025-12-10T00:00:00.000Z"),
      periodEnd: now,
    });

    const service = createService();
    await service.renewDueSubscriptions(now);
    await service.renewDueSubscriptions(now);

    const transactions = await db
      .select()
      .from(billingTransactions)
      .where(eq(billingTransactions.companyId, companyId));
    const renewals = transactions.filter((t) => t.type === "subscription_renewal");
    expect(renewals).toHaveLength(1);
  });

  it("fails card and sets past_due when gateway fails", async () => {
    process.env.DUMMY_GATEWAY_ALWAYS_APPROVE = "false";
    const companyId = await createCompany();
    const planId = await createPlan(900);
    await createPaymentMethod({ companyId });
    await createSubscription({
      companyId,
      planId,
      periodStart: new Date("2025-12-10T00:00:00.000Z"),
      periodEnd: now,
    });

    const service = createService();
    await service.renewDueSubscriptions(now);

    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.companyId, companyId));
    expect(sub?.status).toBe("past_due");
    expect(sub?.graceUntil).toBeTruthy();

    process.env.DUMMY_GATEWAY_ALWAYS_APPROVE = "true";
  });

  it("renews via wallet when no token exists", async () => {
    const companyId = await createCompany();
    const planId = await createPlan(400);
    await seedWallet(companyId, 1000);
    await createSubscription({
      companyId,
      planId,
      periodStart: new Date("2025-12-10T00:00:00.000Z"),
      periodEnd: now,
    });

    const service = createService();
    await service.renewDueSubscriptions(now);

    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.companyId, companyId));
    expect(sub?.status).toBe("active");
    expect(sub?.paymentMethod).toBe("wallet");
  });

  it("cancels after grace period", async () => {
    const companyId = await createCompany();
    const planId = await createPlan(300);
    await createSubscription({
      companyId,
      planId,
      periodStart: new Date("2025-12-10T00:00:00.000Z"),
      periodEnd: now,
      status: "past_due",
    });

    await db
      .update(subscriptions)
      .set({ graceUntil: new Date("2026-01-01T00:00:00.000Z") })
      .where(eq(subscriptions.companyId, companyId));

    const service = createService();
    await service.cancelExpiredGrace(new Date("2026-01-05T00:00:00.000Z"));

    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.companyId, companyId));
    expect(sub?.status).toBe("cancelled");
  });

  it("applies scheduled downgrade on renewal", async () => {
    const companyId = await createCompany();
    const planId = await createPlan(1200);
    const downgradePlanId = await createPlan(600);
    await createPaymentMethod({ companyId });
    await createSubscription({
      companyId,
      planId,
      periodStart: new Date("2025-12-10T00:00:00.000Z"),
      periodEnd: now,
      scheduledPlanId: downgradePlanId,
    });

    const service = createService();
    await service.renewDueSubscriptions(now);

    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.companyId, companyId));
    expect(sub?.planId).toBe(downgradePlanId);
    expect(sub?.scheduledPlanId).toBeNull();
  });
});
