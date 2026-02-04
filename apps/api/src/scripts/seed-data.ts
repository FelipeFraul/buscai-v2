import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import bcrypt from "bcryptjs";
// eslint-disable-next-line import/no-unresolved
import { parse } from "csv-parse/sync";
import { and, eq } from "drizzle-orm";

import { ENV } from "../config/env";
import { db } from "../core/database/client";
import { AuthRepository } from "../modules/auth/auth.repository";
import { cities, niches } from "../modules/catalog/catalog.schema";
import { companies, companyNiches } from "../modules/companies/companies.schema";

type CsvRecord = Record<string, string>;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const seedDir = path.resolve(__dirname, "../../seed");
const nichesPath = path.join(seedDir, "niches.csv");
const companiesPath = path.join(seedDir, "companies.csv");

function slugify(label: string): string {
  return label
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

async function ensureDemoOwner(): Promise<string> {
  const repo = new AuthRepository();
  const demoEmail = ENV.DEMO_USER_EMAIL;
  const demoPassword = ENV.DEMO_USER_PASSWORD;

  const existing = await repo.findByEmail(demoEmail);
  if (existing) {
    return existing.id;
  }

  const passwordHash = await bcrypt.hash(demoPassword, 10);
  const created = await repo.createUser({
    name: "Demo User",
    email: demoEmail,
    passwordHash,
    role: "company_owner",
  });
  return created.id;
}

async function ensureCity(name: string, state: string) {
  const [city] = await db.select().from(cities).where(eq(cities.name, name)).limit(1);
  if (city) return city;
  const [created] = await db
    .insert(cities)
    .values({ name, state, isActive: true })
    .returning();
  return created;
}

async function upsertNiches(): Promise<Map<string, string>> {
  const content = fs.readFileSync(nichesPath, "utf-8");
  const records = parse(content, { relaxColumnCount: true, skipEmptyLines: true }) as string[][];
  const nicheMap = new Map<string, string>();

  for (const row of records) {
    const label = (row[0] ?? "").trim();
    if (!label) continue;
    const slug = slugify(label);

    const [existing] = await db.select().from(niches).where(eq(niches.slug, slug)).limit(1);
    if (existing) {
      nicheMap.set(label, existing.id);
      continue;
    }

    const [created] = await db
      .insert(niches)
      .values({ label, slug, isActive: true })
      .returning();
    nicheMap.set(label, created.id);
  }

  return nicheMap;
}

async function upsertCompany(params: {
  name: string;
  cityId: string;
  nicheId: string;
  address?: string;
  phone?: string;
  whatsapp?: string;
  ownerId: string;
}) {
  const [existing] = await db
    .select()
    .from(companies)
    .where(and(eq(companies.tradeName, params.name), eq(companies.cityId, params.cityId)))
    .limit(1);

  const companyId =
    existing?.id ??
    (
      await db
        .insert(companies)
        .values({
          tradeName: params.name,
          legalName: params.name,
          cityId: params.cityId,
          ownerId: params.ownerId,
          address: params.address,
          phone: params.phone,
          whatsapp: params.whatsapp,
          status: "active",
        })
        .returning()
    )[0].id;

  const linkExists = await db
    .select()
    .from(companyNiches)
    .where(and(eq(companyNiches.companyId, companyId), eq(companyNiches.nicheId, params.nicheId)))
    .limit(1);
  if (!linkExists.length) {
    await db.insert(companyNiches).values({ companyId, nicheId: params.nicheId });
  }
}

async function seedCompanies(nicheMap: Map<string, string>, cityId: string, ownerId: string) {
  const content = fs.readFileSync(companiesPath, "utf-8");
  const records = parse(content, {
    columns: true,
    skipEmptyLines: true,
    relaxQuotes: true,
  }) as CsvRecord[];

  for (const row of records) {
    const nicheLabel = row["Nicho"]?.trim();
    if (!nicheLabel) continue;
    const nicheId: string =
      nicheMap.get(nicheLabel) ??
      (await db
        .insert(niches)
        .values({ label: nicheLabel, slug: slugify(nicheLabel), isActive: true })
        .returning()
        .then((res) => res[0].id));

    const name = row["Nome"]?.trim();
    if (!name) continue;
    const address = row["Endereço"]?.trim();
    const phone = row["Telefone"]?.trim();
    const whatsappFlag = row["WhatsApp"]?.toLowerCase() === "sim";
    const whatsapp = whatsappFlag ? phone : undefined;

    await upsertCompany({
      name,
      cityId,
      nicheId,
      address,
      phone,
      whatsapp,
      ownerId,
    });
  }
}

async function main() {
  // Using console here intentionally for CLI feedback
  console.info("Seeding data...");
  const ownerId = await ensureDemoOwner();
  const city = await ensureCity("Itapetininga", "SP");
  const nicheMap = await upsertNiches();
  await seedCompanies(nicheMap, city.id, ownerId);
  console.info("Seed completed.");
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
