import { performance } from "node:perf_hooks";

import bcrypt from "bcryptjs";
import { and, eq, ilike } from "drizzle-orm";

import { db } from "../core/database/client";
import { cities, niches } from "../modules/catalog/catalog.schema";
import { companies, companyNiches } from "../modules/companies/companies.schema";
import { users } from "../modules/auth/auth.schema";
import { productOffers, productPlans } from "../modules/products/products.schema";
import { subscriptions } from "../modules/subscriptions/subscriptions.schema";

type ProductSeed = { title: string; priceCents: number };

const CITY_NAME = "Itapetininga";
const CITY_STATE = "SP";
const NICHE_LABEL = "Produtos";
const OWNER_EMAIL = "loadtest+produtos@buscai.local";
const COMPANY_PREFIX = "LT Produtos - Empresa";
const COMPANIES_PER_PRODUCT = 10;

const PRODUCTS: ProductSeed[] = [
  { title: "Arroz branco 5kg", priceCents: 3290 },
  { title: "Feijao carioca 1kg", priceCents: 890 },
  { title: "Acucar refinado 1kg", priceCents: 549 },
  { title: "Cafe torrado e moido 500g", priceCents: 1690 },
  { title: "Leite integral 1L", priceCents: 479 },
  { title: "Oleo de soja 900ml", priceCents: 799 },
  { title: "Macarrao espaguete 500g", priceCents: 429 },
  { title: "Farinha de trigo 1kg", priceCents: 599 },
  { title: "Sal refinado 1kg", priceCents: 249 },
  { title: "Margarina 500g", priceCents: 699 },
  { title: "Manteiga 200g", priceCents: 990 },
  { title: "Queijo mussarela fatiado 200g", priceCents: 1290 },
  { title: "Presunto fatiado 200g", priceCents: 999 },
  { title: "Pao de forma 500g", priceCents: 849 },
  { title: "Biscoito recheado 140g", priceCents: 349 },
  { title: "Iogurte natural 170g", priceCents: 299 },
  { title: "Iogurte saborizado 1L", priceCents: 649 },
  { title: "Coca-cola 2L", priceCents: 899 },
  { title: "Suco integral uva 1L", priceCents: 1290 },
  { title: "Achocolatado em po 400g", priceCents: 949 },
  { title: "Aveia em flocos 500g", priceCents: 699 },
  { title: "Cereal matinal 300g", priceCents: 1190 },
  { title: "Molho de tomate 340g", priceCents: 279 },
  { title: "Ketchup 400g", priceCents: 649 },
  { title: "Maionese 500g", priceCents: 799 },
  { title: "Mostarda 200g", priceCents: 349 },
  { title: "Atum em lata 170g", priceCents: 990 },
  { title: "Sardinha em lata 125g", priceCents: 549 },
  { title: "Milho verde em conserva 170g", priceCents: 329 },
  { title: "Ervilha em conserva 170g", priceCents: 319 },
  { title: "Arroz integral 1kg", priceCents: 749 },
  { title: "Feijao preto 1kg", priceCents: 899 },
  { title: "Lentilha 500g", priceCents: 690 },
  { title: "Grao-de-bico 500g", priceCents: 790 },
  { title: "Farinha de mandioca 1kg", priceCents: 649 },
  { title: "Fuba 1kg", priceCents: 429 },
  { title: "Acucar mascavo 500g", priceCents: 699 },
  { title: "Mel 250g", priceCents: 1290 },
  { title: "Geleia de morango 320g", priceCents: 849 },
  { title: "Chocolate ao leite 90g", priceCents: 599 },
  { title: "Chocolate meio amargo 90g", priceCents: 649 },
  { title: "Bolo pronto 300g", priceCents: 790 },
  { title: "Pizza congelada 460g", priceCents: 1890 },
  { title: "Hamburguer congelado 672g", priceCents: 1990 },
  { title: "Nuggets de frango 300g", priceCents: 1490 },
  { title: "Lasanha congelada 600g", priceCents: 2290 },
  { title: "Batata palha 140g", priceCents: 749 },
  { title: "Fone Bluetooth", priceCents: 14990 },
  { title: "Smartwatch basico", priceCents: 22900 },
  { title: "Teclado mecanico gamer", priceCents: 38900 },
  { title: "Mouse sem fio", priceCents: 7990 },
  { title: "Webcam Full HD", priceCents: 21900 },
  { title: "Caixa de som Bluetooth", priceCents: 19990 },
  { title: "Power bank 20000 mAh", priceCents: 18900 },
];

const buildCompanyLabel = (index: number) =>
  `${COMPANY_PREFIX} ${String(index).padStart(2, "0")}`;

const ensureOwner = async () => {
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.email, OWNER_EMAIL))
    .limit(1);
  if (existing) return existing;
  const passwordHash = await bcrypt.hash("produtos123", 10);
  const [created] = await db
    .insert(users)
    .values({ name: "Load Test Produtos", email: OWNER_EMAIL, passwordHash, role: "company_owner" })
    .returning();
  return created;
};

const ensureCity = async () => {
  const [existing] = await db
    .select()
    .from(cities)
    .where(and(ilike(cities.name, CITY_NAME), eq(cities.state, CITY_STATE)))
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(cities)
    .values({ name: CITY_NAME, state: CITY_STATE, isActive: true })
    .returning();
  return created;
};

const ensureNiche = async () => {
  const [existing] = await db
    .select()
    .from(niches)
    .where(ilike(niches.label, NICHE_LABEL))
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(niches)
    .values({
      label: NICHE_LABEL,
      slug: "produtos",
      isActive: true,
    })
    .returning();
  return created;
};

const ensurePlan = async () => {
  const [existing] = await db
    .select()
    .from(productPlans)
    .where(ilike(productPlans.name, "Plano Produtos Seed"))
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(productPlans)
    .values({
      name: "Plano Produtos Seed",
      description: "Plano de seed para ofertas de produtos",
      monthlyPriceCents: 0,
      maxActiveOffers: 1000,
      isActive: true,
    })
    .returning();
  return created;
};

const ensureSubscription = async (companyId: string, planId: string) => {
  const [existing] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.companyId, companyId))
    .limit(1);
  const now = new Date();
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate()));
  if (existing) {
    await db
      .update(subscriptions)
      .set({
        planId,
        status: "active",
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        updatedAt: now,
      })
      .where(eq(subscriptions.id, existing.id));
    return;
  }

  await db.insert(subscriptions).values({
    companyId,
    planId,
    status: "active",
    currentPeriodStart: now,
    currentPeriodEnd: periodEnd,
  });
};

const ensureCompany = async (ownerId: string, cityId: string, nicheId: string, index: number) => {
  const tradeName = buildCompanyLabel(index);
  const [existing] = await db
    .select()
    .from(companies)
    .where(ilike(companies.tradeName, tradeName))
    .limit(1);
  if (existing) {
    await db
      .update(companies)
      .set({ status: "active", cityId, updatedAt: new Date() })
      .where(eq(companies.id, existing.id));
    await db
      .insert(companyNiches)
      .values({ companyId: existing.id, nicheId })
      .onConflictDoNothing();
    return existing;
  }

  const [created] = await db
    .insert(companies)
    .values({
      ownerId,
      tradeName,
      cityId,
      address: `Rua Produtos ${index}, ${CITY_NAME} - ${CITY_STATE}`,
      phone: `5515999${String(100000 + index).slice(-6)}`,
      whatsapp: `5515999${String(200000 + index).slice(-6)}`,
      status: "active",
      source: "manual",
      sourceRef: "product_seed",
    })
    .returning();
  await db.insert(companyNiches).values({ companyId: created.id, nicheId });
  return created;
};

const upsertOffer = async (companyId: string, cityId: string, nicheId: string, offer: ProductSeed, priceCents: number) => {
  const [existing] = await db
    .select()
    .from(productOffers)
    .where(and(eq(productOffers.companyId, companyId), ilike(productOffers.title, offer.title)))
    .limit(1);
  if (existing) {
    await db
      .update(productOffers)
      .set({
        description: "Oferta valida por 24h.",
        priceCents,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(productOffers.id, existing.id));
    return;
  }

  await db.insert(productOffers).values({
    companyId,
    cityId,
    nicheId,
    title: offer.title,
    description: "Oferta valida por 24h.",
    priceCents,
    isActive: true,
  });
};

const main = async () => {
  const start = performance.now();
  const owner = await ensureOwner();
  const city = await ensureCity();
  const niche = await ensureNiche();
  const plan = await ensurePlan();

  const companiesCreated: string[] = [];
  for (let i = 1; i <= COMPANIES_PER_PRODUCT; i += 1) {
    const company = await ensureCompany(owner.id, city.id, niche.id, i);
    await ensureSubscription(company.id, plan.id);
    companiesCreated.push(company.id);
  }

  let offersCreated = 0;
  for (const product of PRODUCTS) {
    for (let i = 0; i < COMPANIES_PER_PRODUCT; i += 1) {
      const companyId = companiesCreated[i];
      const priceCents = product.priceCents + i * 10;
      await upsertOffer(companyId, city.id, niche.id, product, priceCents);
      offersCreated += 1;
    }
  }

  const elapsed = Math.round(performance.now() - start);
  console.log("[product-seed] done", {
    city: `${CITY_NAME}-${CITY_STATE}`,
    niche: NICHE_LABEL,
    companies: COMPANIES_PER_PRODUCT,
    products: PRODUCTS.length,
    offers: offersCreated,
    elapsedMs: elapsed,
  });
};

main().catch((error) => {
  console.error("[product-seed] failed", error);
  process.exit(1);
});
