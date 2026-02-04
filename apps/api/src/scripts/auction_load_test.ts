import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";

import bcrypt from "bcryptjs";
import { and, eq, ilike, inArray, sql } from "drizzle-orm";

import { db } from "../core/database/client";
import { AuctionRepository } from "../modules/auction/auction.repository";
import { AuctionService } from "../modules/auction/auction.service";
import { BillingRepository } from "../modules/billing/billing.repository";
import { BillingService } from "../modules/billing/billing.service";
import { cities, niches } from "../modules/catalog/catalog.schema";
import { companies, companyNiches } from "../modules/companies/companies.schema";
import { CompaniesRepository } from "../modules/companies/companies.repository";
import { ContactService } from "../modules/contacts/contact.service";
import { ContactRepository } from "../modules/contacts/contact.repository";
import { InternalAuditService } from "../modules/internal-audit/internal-audit.service";
import { InternalAuditRepository } from "../modules/internal-audit/internal-audit.repository";
import { SearchRepository } from "../modules/search/search.repository";
import { SearchService } from "../modules/search/search.service";
import { SerpapiService } from "../modules/serpapi/serpapi.service";
import { auctionConfigs } from "../modules/auction/auction.schema";
import { billingWallets } from "../modules/billing/billing.schema";
import { users } from "../modules/auth/auth.schema";

type LoadConfig = {
  city: string;
  state: string;
  niches: number;
  companiesPerNiche: number;
  auctionNiches: number;
  biddersPerNiche: number;
  organicPerNiche: number;
  seed: number;
  runId: string;
  cleanup: boolean;
};

type NicheInfo = { id: string; label: string; slug: string };
type CompanyInfo = { id: string; tradeName: string; nicheId: string };

type Report = {
  runId: string;
  startedAt: string;
  params: LoadConfig;
  totals: {
    niches: { created: number; existing: number };
    companies: { created: number; existing: number };
    companyNiches: { inserted: number };
    auctionConfigs: { created: number; updated: number };
    wallets: { created: number; updated: number };
  };
  metrics: {
    paidCount: { min: number; avg: number; max: number };
    organicCount: { min: number; avg: number; max: number };
    distinctPaidTop3: { min: number; avg: number; max: number };
    distinctBidders: { min: number; avg: number; max: number };
    organicAvailable: { min: number; avg: number; max: number };
  };
  anomalies: string[];
  samples: Array<{
    nicheId: string;
    nicheLabel: string;
    paidCount: number;
    organicCount: number;
    distinctPaidTop3: number;
    distinctBidders: number;
    organicAvailable: number;
    top5: Array<{
      position: number;
      companyId: string | null;
      name: string | null;
      isPaid: boolean;
    }>;
  }>;
  timingsMs: Record<string, number>;
};

const SCRIPT_NAME = "auction_load_test";
const REPORT_DIR = path.resolve(process.cwd(), "reports");

const parseArgs = (): LoadConfig => {
  const args = process.argv.slice(2);
  const getArg = (flag: string) => {
    const index = args.findIndex((item) => item === flag || item.startsWith(`${flag}=`));
    if (index === -1) return null;
    if (args[index].includes("=")) {
      return args[index].split("=")[1] ?? null;
    }
    return args[index + 1] ?? null;
  };

  const numeric = (value: string | null, fallback: number) => {
    if (!value) return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const runId = getArg("--runId");
  const cleanup = args.includes("--cleanup");

  const now = new Date();
  const runStamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
    now.getDate()
  ).padStart(2, "0")}${String(now.getHours()).padStart(2, "0")}${String(
    now.getMinutes()
  ).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;

  return {
    city: getArg("--city") ?? "Itapetininga",
    state: getArg("--state") ?? "SP",
    niches: numeric(getArg("--niches"), 100),
    companiesPerNiche: numeric(getArg("--companiesPerNiche"), 20),
    auctionNiches: numeric(getArg("--auctionNiches"), 80),
    biddersPerNiche: numeric(getArg("--biddersPerNiche"), 10),
    organicPerNiche: numeric(getArg("--organicPerNiche"), 4),
    seed: numeric(getArg("--seed"), 123),
    runId: runId ?? `LT_${runStamp}`,
    cleanup,
  };
};

const slugify = (label: string) =>
  label
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);

const mulberry32 = (seed: number) => {
  let t = seed;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

const buildMetrics = (values: number[]) => {
  if (!values.length) {
    return { min: 0, avg: 0, max: 0 };
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  return { min, avg, max };
};

const ensureReportDir = () => {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
};

const buildNicheLabel = (runId: string, index: number) =>
  `LT ${runId} - Nicho ${String(index).padStart(3, "0")}`;

const buildCompanyLabel = (runId: string, nicheIndex: number, companyIndex: number) =>
  `LT ${runId} - Empresa ${String(nicheIndex).padStart(3, "0")}-${String(
    companyIndex
  ).padStart(2, "0")}`;

const buildPhone = (seed: number, nicheIndex: number, companyIndex: number) => {
  const base = 90000000 + ((seed + nicheIndex * 31 + companyIndex * 7) % 9000000);
  return `5515${base}`;
};

const ensureUser = async (email: string) => {
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) return existing;
  const passwordHash = await bcrypt.hash("loadtest123", 10);
  const [created] = await db
    .insert(users)
    .values({ name: "Load Test User", email, passwordHash, role: "company_owner" })
    .returning();
  return created;
};

const ensureCity = async (name: string, state: string) => {
  const [existing] = await db
    .select()
    .from(cities)
    .where(and(ilike(cities.name, name), eq(cities.state, state)))
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(cities)
    .values({ name, state, isActive: true })
    .returning();
  return created;
};

const cleanupByRunId = async (runId: string) => {
  const nichePrefix = `LT ${runId} - Nicho`;
  const companyPrefix = `LT ${runId} - Empresa`;

  const nicheRows = await db
    .select({ id: niches.id })
    .from(niches)
    .where(ilike(niches.label, `${nichePrefix}%`));
  const nicheIds = nicheRows.map((row) => row.id);

  const companyRows = await db
    .select({ id: companies.id })
    .from(companies)
    .where(ilike(companies.tradeName, `${companyPrefix}%`));
  const companyIds = companyRows.map((row) => row.id);

  if (companyIds.length) {
    await db.delete(auctionConfigs).where(inArray(auctionConfigs.companyId, companyIds));
    await db.delete(companyNiches).where(inArray(companyNiches.companyId, companyIds));
    await db.delete(companies).where(inArray(companies.id, companyIds));
  }
  if (nicheIds.length) {
    await db.delete(auctionConfigs).where(inArray(auctionConfigs.nicheId, nicheIds));
    await db.delete(companyNiches).where(inArray(companyNiches.nicheId, nicheIds));
    await db.delete(niches).where(inArray(niches.id, nicheIds));
  }
};

const main = async () => {
  if (process.env.NODE_ENV === "production") {
    console.error(`[${SCRIPT_NAME}] refusing to run in production`);
    process.exit(1);
  }

  const config = parseArgs();
  if (config.biddersPerNiche > config.companiesPerNiche - config.organicPerNiche) {
    console.error(
      `[${SCRIPT_NAME}] biddersPerNiche must leave at least ${config.organicPerNiche} organic companies`
    );
    process.exit(1);
  }

  const startedAt = new Date().toISOString();
  const timings: Record<string, number> = {};
  const mark = (label: string, start: number) => {
    timings[label] = Math.round(performance.now() - start);
  };

  const report: Report = {
    runId: config.runId,
    startedAt,
    params: config,
    totals: {
      niches: { created: 0, existing: 0 },
      companies: { created: 0, existing: 0 },
      companyNiches: { inserted: 0 },
      auctionConfigs: { created: 0, updated: 0 },
      wallets: { created: 0, updated: 0 },
    },
    metrics: {
      paidCount: { min: 0, avg: 0, max: 0 },
      organicCount: { min: 0, avg: 0, max: 0 },
      distinctPaidTop3: { min: 0, avg: 0, max: 0 },
      distinctBidders: { min: 0, avg: 0, max: 0 },
      organicAvailable: { min: 0, avg: 0, max: 0 },
    },
    anomalies: [],
    samples: [],
    timingsMs: {},
  };

  const startCleanup = performance.now();
  if (config.cleanup) {
    await cleanupByRunId(config.runId);
  }
  mark("cleanup", startCleanup);

  const startUser = performance.now();
  const userEmail = `loadtest+${config.runId}@buscai.local`;
  const owner = await ensureUser(userEmail);
  const ownerId = owner.id;
  mark("ensureUser", startUser);

  const startCity = performance.now();
  const city = await ensureCity(config.city, config.state);
  mark("ensureCity", startCity);

  const startNiches = performance.now();
  const nicheLabels = Array.from({ length: config.niches }, (_, index) =>
    buildNicheLabel(config.runId, index + 1)
  );
  const nicheSlugs = nicheLabels.map((label) => slugify(label));
  const existingNiches = await db
    .select()
    .from(niches)
    .where(inArray(niches.slug, nicheSlugs));
  report.totals.niches.existing = existingNiches.length;
  const nicheMap = new Map<string, NicheInfo>();
  existingNiches.forEach((item) => {
    nicheMap.set(item.slug, { id: item.id, label: item.label, slug: item.slug });
  });
  const missingNiches = nicheLabels
    .map((label, idx) => ({ label, slug: nicheSlugs[idx] }))
    .filter((item) => !nicheMap.has(item.slug));

  if (missingNiches.length) {
    const inserted = await db
      .insert(niches)
      .values(missingNiches.map((item) => ({ label: item.label, slug: item.slug, isActive: true })))
      .returning();
    report.totals.niches.created = inserted.length;
    inserted.forEach((item) => nicheMap.set(item.slug, item));
  }
  mark("ensureNiches", startNiches);

  const startCompanies = performance.now();
  const companyPrefix = `LT ${config.runId} - Empresa`;
  const existingCompanies = await db
    .select({ id: companies.id, tradeName: companies.tradeName })
    .from(companies)
    .where(and(eq(companies.cityId, city.id), ilike(companies.tradeName, `${companyPrefix}%`)));
  report.totals.companies.existing = existingCompanies.length;
  const companyMap = new Map<string, string>();
  existingCompanies.forEach((item) => companyMap.set(item.tradeName, item.id));

  const companyBatch: Array<typeof companies.$inferInsert> = [];
  const companyRecords: CompanyInfo[] = [];
  for (let nicheIndex = 0; nicheIndex < config.niches; nicheIndex += 1) {
    for (let companyIndex = 1; companyIndex <= config.companiesPerNiche; companyIndex += 1) {
      const name = buildCompanyLabel(config.runId, nicheIndex + 1, companyIndex);
      const existingId = companyMap.get(name);
      const nicheLabel = buildNicheLabel(config.runId, nicheIndex + 1);
      const nicheSlug = slugify(nicheLabel);
      const nicheInfo = nicheMap.get(nicheSlug);
      if (!nicheInfo) continue;
      if (existingId) {
        companyRecords.push({ id: existingId, tradeName: name, nicheId: nicheInfo.id });
        continue;
      }
      const phone = buildPhone(config.seed, nicheIndex + 1, companyIndex);
      companyBatch.push({
        ownerId,
        tradeName: name,
        legalName: name,
        cityId: city.id,
        address: `Rua LT ${config.runId} ${companyIndex}, ${config.city} - ${config.state}`,
        phone,
        whatsapp: phone,
        openingHours: "08:00-18:00",
        status: "active",
        source: "manual",
        sourceRef: config.runId,
        hasWhatsapp: true,
        participatesInAuction: true,
      });
    }
  }

  const batchSize = 250;
  for (let i = 0; i < companyBatch.length; i += batchSize) {
    const batch = companyBatch.slice(i, i + batchSize);
    const inserted = await db
      .insert(companies)
      .values(batch)
      .returning({ id: companies.id, tradeName: companies.tradeName });
    report.totals.companies.created += inserted.length;
    inserted.forEach((item) => companyMap.set(item.tradeName, item.id));
  }

  for (let nicheIndex = 0; nicheIndex < config.niches; nicheIndex += 1) {
    const nicheLabel = buildNicheLabel(config.runId, nicheIndex + 1);
    const nicheSlug = slugify(nicheLabel);
    const nicheInfo = nicheMap.get(nicheSlug);
    if (!nicheInfo) continue;
    for (let companyIndex = 1; companyIndex <= config.companiesPerNiche; companyIndex += 1) {
      const name = buildCompanyLabel(config.runId, nicheIndex + 1, companyIndex);
      const id = companyMap.get(name);
      if (!id) continue;
      companyRecords.push({ id, tradeName: name, nicheId: nicheInfo.id });
    }
  }

  mark("ensureCompanies", startCompanies);

  const startLinks = performance.now();
  const linkBatch: Array<typeof companyNiches.$inferInsert> = companyRecords.map((entry) => ({
    companyId: entry.id,
    nicheId: entry.nicheId,
  }));
  const linkChunk = 500;
  for (let i = 0; i < linkBatch.length; i += linkChunk) {
    const chunk = linkBatch.slice(i, i + linkChunk);
    const inserted = await db
      .insert(companyNiches)
      .values(chunk)
      .onConflictDoNothing()
      .returning({ companyId: companyNiches.companyId });
    report.totals.companyNiches.inserted += inserted.length;
  }
  mark("linkCompanies", startLinks);

  const startAuction = performance.now();
  const rng = mulberry32(config.seed);
  const auctionNicheCount = Math.min(config.auctionNiches, config.niches);
  const bidderCompanyIds: string[] = [];

  for (let nicheIndex = 0; nicheIndex < auctionNicheCount; nicheIndex += 1) {
    const nicheLabel = buildNicheLabel(config.runId, nicheIndex + 1);
    const nicheSlug = slugify(nicheLabel);
    const nicheInfo = nicheMap.get(nicheSlug);
    if (!nicheInfo) continue;

    const companiesForNiche = companyRecords.filter((item) => item.nicheId === nicheInfo.id);
    const shuffled = [...companiesForNiche];
    const localRng = mulberry32(config.seed + nicheIndex);
    shuffled.sort(() => localRng() - 0.5);
    const bidders = shuffled.slice(0, config.biddersPerNiche);
    const bidderIds = bidders.map((bidder) => bidder.id);
    bidderCompanyIds.push(...bidderIds);

    const existingConfigs = await db
      .select()
      .from(auctionConfigs)
      .where(
        and(
          eq(auctionConfigs.cityId, city.id),
          eq(auctionConfigs.nicheId, nicheInfo.id),
          inArray(auctionConfigs.companyId, bidderIds)
        )
      );
    const configMap = new Map<string, string>();
    existingConfigs.forEach((config) => configMap.set(config.companyId, config.id));

    for (let index = 0; index < bidders.length; index += 1) {
      const bidder = bidders[index];
      const bidBase = 1000 + nicheIndex * 7;
      const jitter = Math.floor(rng() * 10);
      const bid1 = bidBase + index * 10 + jitter;
      const bid2 = Math.max(50, bid1 - 20);
      const bid3 = Math.max(50, bid1 - 40);

      const payload = {
        companyId: bidder.id,
        cityId: city.id,
        nicheId: nicheInfo.id,
        mode: "manual" as const,
        bidPosition1: bid1.toString(),
        bidPosition2: bid2.toString(),
        bidPosition3: bid3.toString(),
        dailyBudget: "10000",
        pauseOnLimit: true,
        isActive: true,
      };

      const existingId = configMap.get(bidder.id);
      if (existingId) {
        await db.update(auctionConfigs).set(payload).where(eq(auctionConfigs.id, existingId));
        report.totals.auctionConfigs.updated += 1;
      } else {
        await db.insert(auctionConfigs).values(payload);
        report.totals.auctionConfigs.created += 1;
      }
    }
  }

  const bidderSet = Array.from(new Set(bidderCompanyIds));
  if (bidderSet.length) {
    const walletRows = await db
      .select({ companyId: billingWallets.companyId })
      .from(billingWallets)
      .where(inArray(billingWallets.companyId, bidderSet));
    const walletMap = new Set(walletRows.map((row) => row.companyId));
    const walletCreates = bidderSet.filter((id) => !walletMap.has(id));
    const walletUpdates = bidderSet.filter((id) => walletMap.has(id));
    if (walletCreates.length) {
      await db
        .insert(billingWallets)
        .values(walletCreates.map((companyId) => ({ companyId, balance: "1000000", reserved: "0" })));
      report.totals.wallets.created += walletCreates.length;
    }
    if (walletUpdates.length) {
      await db
        .update(billingWallets)
        .set({ balance: "1000000" })
        .where(inArray(billingWallets.companyId, walletUpdates));
      report.totals.wallets.updated += walletUpdates.length;
    }
  }

  mark("auctionConfigs", startAuction);

  const startValidation = performance.now();
  const searchRepository = new SearchRepository();
  const auctionService = new AuctionService(
    new AuctionRepository(),
    searchRepository,
    new BillingRepository()
  );
  const searchService = new SearchService(
    searchRepository,
    auctionService,
    new BillingService(new BillingRepository(), new CompaniesRepository()),
    new InternalAuditService(new InternalAuditRepository()),
    new ContactService(new ContactRepository(), new CompaniesRepository()),
    undefined,
    new SerpapiService()
  );

  const paidCounts: number[] = [];
  const organicCounts: number[] = [];
  const distinctPaidCounts: number[] = [];
  const distinctBidderCounts: number[] = [];
  const organicAvailableCounts: number[] = [];

  for (let nicheIndex = 0; nicheIndex < config.niches; nicheIndex += 1) {
    const nicheLabel = buildNicheLabel(config.runId, nicheIndex + 1);
    const nicheSlug = slugify(nicheLabel);
    const nicheInfo = nicheMap.get(nicheSlug);
    if (!nicheInfo) continue;

    const response = await searchService.publicSearch({
      text: "consulta",
      city: config.city,
      niche: nicheLabel,
      limit: 5,
      source: "web",
    });

    const results = response.results ?? [];
    const top5 = results.slice(0, 5);
    const paidCount = top5.filter((item) => item.isPaid).length;
    const organicCount = top5.filter((item) => !item.isPaid).length;
    const distinctPaidTop3 = new Set(
      top5
        .slice(0, 3)
        .filter((item) => item.isPaid)
        .map((item) => item.company?.id ?? "")
    ).size;

    const [bidderRow] = await db
      .select({ value: sql<number>`count(distinct ${auctionConfigs.companyId})::int` })
      .from(auctionConfigs)
      .where(
        and(
          eq(auctionConfigs.cityId, city.id),
          eq(auctionConfigs.nicheId, nicheInfo.id),
          eq(auctionConfigs.isActive, true)
        )
      );
    const distinctBidders = Number(bidderRow?.value ?? 0);

    const [organicRow] = await db
      .select({ value: sql<number>`count(distinct ${companies.id})::int` })
      .from(companies)
      .innerJoin(
        companyNiches,
        and(eq(companyNiches.companyId, companies.id), eq(companyNiches.nicheId, nicheInfo.id))
      )
      .leftJoin(
        auctionConfigs,
        and(
          eq(auctionConfigs.companyId, companies.id),
          eq(auctionConfigs.nicheId, nicheInfo.id),
          eq(auctionConfigs.cityId, city.id)
        )
      )
      .where(
        and(
          eq(companies.cityId, city.id),
          eq(companies.status, "active"),
          sql`${auctionConfigs.companyId} is null`
        )
      );
    const organicAvailable = Number(organicRow?.value ?? 0);

    if (nicheIndex < config.auctionNiches) {
      const expectedPaid = Math.min(3, distinctBidders);
      if (paidCount < expectedPaid) {
        report.anomalies.push(
          `paid_count_lt_${expectedPaid}:${nicheLabel}:${paidCount}`
        );
      }
    }
    if (distinctPaidTop3 < Math.min(3, paidCount)) {
      report.anomalies.push(`paid_duplicates_in_top3:${nicheLabel}`);
    }
    if (distinctBidders < config.biddersPerNiche && nicheIndex < config.auctionNiches) {
      report.anomalies.push(
        `distinct_bidders_lt_${config.biddersPerNiche}:${nicheLabel}:${distinctBidders}`
      );
    }
    if (organicAvailable < config.organicPerNiche) {
      report.anomalies.push(
        `organic_available_lt_${config.organicPerNiche}:${nicheLabel}:${organicAvailable}`
      );
    }

    paidCounts.push(paidCount);
    organicCounts.push(organicCount);
    distinctPaidCounts.push(distinctPaidTop3);
    distinctBidderCounts.push(distinctBidders);
    organicAvailableCounts.push(organicAvailable);

    report.samples.push({
      nicheId: nicheInfo.id,
      nicheLabel,
      paidCount,
      organicCount,
      distinctPaidTop3,
      distinctBidders,
      organicAvailable,
      top5: top5.map((item, index) => ({
        position: item.position ?? index + 1,
        companyId: item.company?.id ?? null,
        name: item.company?.tradeName ?? null,
        isPaid: item.isPaid ?? false,
      })),
    });
  }

  report.metrics = {
    paidCount: buildMetrics(paidCounts),
    organicCount: buildMetrics(organicCounts),
    distinctPaidTop3: buildMetrics(distinctPaidCounts),
    distinctBidders: buildMetrics(distinctBidderCounts),
    organicAvailable: buildMetrics(organicAvailableCounts),
  };

  mark("validation", startValidation);
  report.timingsMs = timings;

  ensureReportDir();
  const jsonPath = path.join(REPORT_DIR, "auction-load-report.json");
  const mdPath = path.join(REPORT_DIR, "auction-load-report.md");
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf-8");

  const mdLines = [
    `# Auction Load Test Report`,
    "",
    `Run ID: ${report.runId}`,
    `Started: ${report.startedAt}`,
    "",
    "## Parameters",
    `- City: ${config.city}/${config.state}`,
    `- Niches: ${config.niches}`,
    `- Companies per niche: ${config.companiesPerNiche}`,
    `- Auction niches: ${config.auctionNiches}`,
    `- Bidders per niche: ${config.biddersPerNiche}`,
    `- Organic per niche: ${config.organicPerNiche}`,
    `- Seed: ${config.seed}`,
    "",
    "## Totals",
    `- Niches created: ${report.totals.niches.created}`,
    `- Niches existing: ${report.totals.niches.existing}`,
    `- Companies created: ${report.totals.companies.created}`,
    `- Companies existing: ${report.totals.companies.existing}`,
    `- Company-to-niche links inserted: ${report.totals.companyNiches.inserted}`,
    `- Auction configs created: ${report.totals.auctionConfigs.created}`,
    `- Auction configs updated: ${report.totals.auctionConfigs.updated}`,
    `- Wallets created: ${report.totals.wallets.created}`,
    `- Wallets updated: ${report.totals.wallets.updated}`,
    "",
    "## Metrics (min/avg/max)",
    `- Paid count: ${report.metrics.paidCount.min}/${report.metrics.paidCount.avg}/${report.metrics.paidCount.max}`,
    `- Organic count: ${report.metrics.organicCount.min}/${report.metrics.organicCount.avg}/${report.metrics.organicCount.max}`,
    `- Distinct paid top3: ${report.metrics.distinctPaidTop3.min}/${report.metrics.distinctPaidTop3.avg}/${report.metrics.distinctPaidTop3.max}`,
    `- Distinct bidders: ${report.metrics.distinctBidders.min}/${report.metrics.distinctBidders.avg}/${report.metrics.distinctBidders.max}`,
    `- Organic available: ${report.metrics.organicAvailable.min}/${report.metrics.organicAvailable.avg}/${report.metrics.organicAvailable.max}`,
    "",
    "## Anomalies",
    report.anomalies.length ? report.anomalies.map((item) => `- ${item}`).join("\n") : "- none",
    "",
    "## Samples (top 5)",
    ...report.samples.map((sample) => {
      const header = `### ${sample.nicheLabel}`;
      const lines = sample.top5.map(
        (entry) =>
          `- #${entry.position} ${entry.isPaid ? "[paid]" : "[organic]"} ${
            entry.name ?? "unknown"
          } (${entry.companyId ?? "n/a"})`
      );
      return [header, ...lines, ""].join("\n");
    }),
  ];

  fs.writeFileSync(mdPath, mdLines.join("\n"), "utf-8");

  console.log(`[${SCRIPT_NAME}] completed`, {
    reportJson: jsonPath,
    reportMarkdown: mdPath,
  });
};

main().catch((error) => {
  console.error(`[${SCRIPT_NAME}] failed`, error);
  process.exit(1);
});
