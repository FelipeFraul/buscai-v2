import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { ENV } from "../src/config/env";
import { users } from "../src/modules/auth/auth.schema";
import { billingWallets } from "../src/modules/billing/billing.schema";
import { cities, niches } from "../src/modules/catalog/catalog.schema";
import { companies, companyNiches } from "../src/modules/companies/companies.schema";

const pool = new Pool({
  connectionString: ENV.DATABASE_URL,
});

const sanitizedConfig = (() => {
  try {
    const url = new URL(ENV.DATABASE_URL);
    return {
      host: url.hostname,
      port: url.port || "5433",
      database: url.pathname.replace(/^\//, ""),
      user: url.username,
    };
  } catch {
    return null;
  }
})();

const db = drizzle(pool);
type UserRecord = typeof users.$inferSelect;

async function getOrCreateCity(name: string, state: string) {
  const [existing] = await db
    .select()
    .from(cities)
    .where(and(eq(cities.name, name), eq(cities.state, state)))
    .limit(1);

  if (existing) {
    return existing;
  }

  const [created] = await db
    .insert(cities)
    .values({
      name,
      state,
      isActive: true,
    })
    .returning();

  return created;
}

async function getOrCreateNiche(slug: string, label: string) {
  const [existing] = await db
    .select()
    .from(niches)
    .where(eq(niches.slug, slug))
    .limit(1);

  if (existing) {
    return existing;
  }

  const [created] = await db
    .insert(niches)
    .values({
      slug,
      label,
      isActive: true,
    })
    .returning();

  return created;
}

async function getOrCreateUser(params: {
  name: string;
  email: string;
  passwordHash: string;
  role: "admin" | "company_owner";
}) {
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.email, params.email))
    .limit(1);

  if (existing) {
    return existing;
  }

  const [created] = await db
    .insert(users)
    .values(params)
    .returning();

  return created;
}

async function getOrCreateCompany(params: {
  ownerId: string;
  tradeName: string;
  legalName: string;
  cityId: string;
  status: "active" | "pending" | "suspended";
}) {
  const [existing] = await db
    .select()
    .from(companies)
    .where(and(eq(companies.ownerId, params.ownerId), eq(companies.tradeName, params.tradeName)))
    .limit(1);

  if (existing) {
    return existing;
  }

  const [created] = await db
    .insert(companies)
    .values(params)
    .returning();

  return created;
}

async function ensureGlobalAdmin(): Promise<UserRecord | null> {
  const email = process.env.SEED_GLOBAL_ADMIN_EMAIL?.trim();
  if (!email) {
    return null;
  }

  const name = process.env.SEED_GLOBAL_ADMIN_NAME?.trim() || "Admin";
  const password = process.env.SEED_GLOBAL_ADMIN_PASSWORD;
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!existing) {
    if (!password || password.length < 10) {
      throw new Error(
        "SEED_GLOBAL_ADMIN_PASSWORD ausente ou fraca. Use pelo menos 10 caracteres."
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [created] = await db
      .insert(users)
      .values({
        email,
        name,
        role: "admin",
        passwordHash,
      })
      .returning();
    console.info(`[seed] global admin criado: ${email}`);
    return created ?? null;
  }

  const updates: Record<string, unknown> = {
    role: "admin",
    name,
  };
  if (password && password.length >= 10) {
    updates.passwordHash = await bcrypt.hash(password, 10);
  }

  const [updated] = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, existing.id))
    .returning();
  console.info(`[seed] global admin garantido: ${email}`);
  return updated ?? existing;
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("db:seed is forbidden in production");
  }

  console.log("Iniciando seed...");

  try {
    if (sanitizedConfig) {
      console.log("[SEED] Usando DATABASE_URL (sanitizada):", sanitizedConfig);
    } else {
      console.log("[SEED] Não foi possível sanitizar DATABASE_URL");
    }
  } catch (error) {
    console.error("[SEED] Failed to parse DATABASE_URL", error);
  }

  try {
    const globalAdmin = await ensureGlobalAdmin();
    const adminPass = await bcrypt.hash("admin123", 10);
    const demoPass = await bcrypt.hash("demo123", 10);

    const city = await getOrCreateCity("Cidade Demo", "SP");
    const adminCity = await getOrCreateCity("Itapetininga", "SP");
    const niche = await getOrCreateNiche("geral", "Geral");
    const admin = await getOrCreateUser({
      name: "Admin",
      email: "admin@buscai.app",
      passwordHash: adminPass,
      role: "admin",
    });
    const owner = await getOrCreateUser({
      name: "Demo Owner",
      email: "demo@buscai.app",
      passwordHash: demoPass,
      role: "company_owner",
    });
    const company = await getOrCreateCompany({
      ownerId: owner.id,
      tradeName: "Empresa Demo LTDA",
      legalName: "Empresa Demo LTDA",
      cityId: city.id,
      status: "active",
    });
    if (globalAdmin) {
      const adminCompany = await getOrCreateCompany({
        ownerId: globalAdmin.id,
        tradeName: "Buscai Admin",
        legalName: "Buscai Admin LTDA",
        cityId: adminCity.id,
        status: "active",
      });

      await db
        .insert(companyNiches)
        .values({
          companyId: adminCompany.id,
          nicheId: niche.id,
        })
        .onConflictDoNothing();

      await db
        .insert(billingWallets)
        .values({
          companyId: adminCompany.id,
          balance: "0",
          reserved: "0",
        })
        .onConflictDoNothing();
    }

    await db
      .insert(companyNiches)
      .values({
        companyId: company.id,
        nicheId: niche.id,
      })
      .onConflictDoNothing();

    await db
      .insert(billingWallets)
      .values({
        companyId: company.id,
        balance: "0",
        reserved: "0",
      })
      .onConflictDoNothing();

    console.log("Seed concluído");
    console.log(`Admin criado: ${admin.email}`);
    console.log(`Demo owner criado: ${owner.email}`);
  } catch (error) {
    console.error("Erro ao executar seed", error);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Erro ao executar seed", error);
  process.exit(1);
});
