import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { ENV } from "../src/config/env";
import { users } from "../src/modules/auth/auth.schema";
import { cities, niches } from "../src/modules/catalog/catalog.schema";

const pool = new Pool({
  connectionString: ENV.DATABASE_URL,
});

const db = drizzle(pool);

const DEFAULT_CITY_NAME = process.env.BOOTSTRAP_CITY_NAME?.trim() || "Itapetininga";
const DEFAULT_CITY_STATE = process.env.BOOTSTRAP_CITY_STATE?.trim() || "SP";
const DEFAULT_NICHE_LABEL = process.env.BOOTSTRAP_NICHE_LABEL?.trim() || "Geral";
const DEFAULT_NICHE_SLUG = process.env.BOOTSTRAP_NICHE_SLUG?.trim() || "geral";

async function ensureAdmin(): Promise<void> {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim() || "Admin";

  const [existingAdmin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, "admin"))
    .limit(1);

  if (existingAdmin) {
    console.log("[bootstrap] admin ja existe, nao alterado.");
    return;
  }

  if (!email || !password || password.length < 10) {
    throw new Error(
      "BOOTSTRAP_ADMIN_EMAIL e BOOTSTRAP_ADMIN_PASSWORD (>=10 chars) sao obrigatorios quando nao existe admin."
    );
  }

  const [existingByEmail] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existingByEmail) {
    await db
      .update(users)
      .set({ role: "admin" })
      .where(eq(users.id, existingByEmail.id));
    console.log("[bootstrap] usuario existente promovido para admin.");
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await db.insert(users).values({
    email,
    name,
    role: "admin",
    passwordHash,
  });
  console.log("[bootstrap] admin criado.");
}

async function ensureCity(): Promise<void> {
  const [city] = await db
    .select({ id: cities.id })
    .from(cities)
    .where(and(eq(cities.name, DEFAULT_CITY_NAME), eq(cities.state, DEFAULT_CITY_STATE)))
    .limit(1);

  if (city) {
    console.log("[bootstrap] cidade ja existe, nao alterada.");
    return;
  }

  await db.insert(cities).values({
    name: DEFAULT_CITY_NAME,
    state: DEFAULT_CITY_STATE,
    isActive: true,
  });
  console.log("[bootstrap] cidade criada.");
}

async function ensureNiche(): Promise<void> {
  const [niche] = await db
    .select({ id: niches.id })
    .from(niches)
    .where(eq(niches.slug, DEFAULT_NICHE_SLUG))
    .limit(1);

  if (niche) {
    console.log("[bootstrap] nicho ja existe, nao alterado.");
    return;
  }

  await db.insert(niches).values({
    slug: DEFAULT_NICHE_SLUG,
    label: DEFAULT_NICHE_LABEL,
    isActive: true,
  });
  console.log("[bootstrap] nicho criado.");
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV !== "production") {
    throw new Error("bootstrap script is intended for production only");
  }

  await ensureAdmin();
  await ensureCity();
  await ensureNiche();
  console.log("[bootstrap] concluido.");
}

main()
  .catch((error) => {
    console.error("[bootstrap] erro", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
