import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const isDev = process.env.NODE_ENV !== "production";
const DEV_DB_URL = "postgres://buscai:buscai@localhost:5433/buscai";

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(3001),
  HTTP_BODY_LIMIT_BYTES: z.coerce.number().int().positive().default(2_097_152),
  DATABASE_URL: z.string().optional(),
  JWT_SECRET: z.string().min(16),
  REFRESH_SECRET: z.string().min(16).optional(),
  JWT_EXPIRES_IN: z.string().default("15m"),
  REFRESH_EXPIRES_IN: z.string().default("30d"),
  DEMO_USER_EMAIL: z.string().default("demo@buscai.app"),
  DEMO_USER_PASSWORD: z.string().default("demo123"),
  WHATSAPP_WEBHOOK_SECRET: z.string().min(16).optional(),
  WHATSAPP_WEBHOOK_RATE_LIMIT: z.coerce.number().default(30),
  WHATSAPP_WEBHOOK_RATE_WINDOW_MS: z.coerce.number().default(60_000),
  WHATSAPP_PROVIDER: z.enum(["meta", "zapi"]).default("meta"),
  WHATSAPP_API_URL: z.string().url().optional(),
  WHATSAPP_API_TOKEN: z.string().min(16).optional(),
  WHATSAPP_DEFAULT_CITY_ID: z.string().uuid().optional(),
  WHATSAPP_DEFAULT_NICHE_ID: z.string().optional(),
  WHATSAPP_META_API_VERSION: z.string().default("v20.0"),
  WHATSAPP_META_PHONE_NUMBER_ID: z.string().optional(),
  ZAPI_WEBHOOK_TOKEN: z.string().min(8).optional(),
  ZAPI_INSTANCE_ID: z.string().optional(),
  ZAPI_INSTANCE_TOKEN: z.string().optional(),
  ZAPI_BASE_URL: z.string().url().optional(),
  ZAPI_CLIENT_TOKEN: z.string().optional(),
  DEFAULT_CITY_NAME: z.string().optional(),
  PUBLIC_BASE_URL: z.string().optional(),
  CLAIM_SUPPORT_WHATSAPP: z.string().min(1),
  SERPAPI_API_KEY: z.string().min(1),
  SERPAPI_BASE_URL: z.string().url().default("https://serpapi.com/search"),
  SERPAPI_ENGINE: z.string().default("google_maps"),
  SERPAPI_DEFAULT_LIMIT: z.coerce.number().default(20),
  SERPAPI_ENCRYPTION_KEY: z.string().min(8),
  SEARCH_USE_TRGM: z.coerce.boolean().default(false),
  CHAOS_ENABLED: z.string().optional(),
  CHAOS_LATENCY_MS: z.coerce.number().default(0),
  CHAOS_ERROR_RATE: z.coerce.number().default(0),
  CHAOS_DB_SLEEP_MS: z.coerce.number().default(0),
  BUSCAI_READONLY: z.coerce.boolean().default(false),
  BUSCAI_DISABLE_AUCTION: z.coerce.boolean().default(false),
  BUSCAI_FORCE_AUCTION_VISIBILITY: z.coerce.boolean().default(false),
  BUSCAI_DISABLE_HEAVY_LOGS: z.coerce.boolean().default(false),
  SEED_GLOBAL_ADMIN_EMAIL: z.string().optional(),
  SEED_GLOBAL_ADMIN_PASSWORD: z.string().optional(),
  PAYMENT_PROVIDER: z.enum(["stripe", "pagarme", "mercadopago", "dummy"]).default("dummy"),
  DUMMY_GATEWAY_ALWAYS_APPROVE: z.coerce.boolean().default(true),
  SUBSCRIPTION_GRACE_DAYS: z.coerce.number().default(3),
});

const data = envSchema.parse(process.env);
if (data.WHATSAPP_PROVIDER === "meta") {
  if (!data.WHATSAPP_WEBHOOK_SECRET) {
    throw new Error("WHATSAPP_WEBHOOK_SECRET is required when WHATSAPP_PROVIDER=meta");
  }
  if (!data.WHATSAPP_API_TOKEN) {
    throw new Error("WHATSAPP_API_TOKEN is required when WHATSAPP_PROVIDER=meta");
  }
}
const resolvedDatabaseUrl = data.DATABASE_URL ?? (isDev ? DEV_DB_URL : undefined);

if (!resolvedDatabaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

if (data.NODE_ENV === "production") {
  if (data.WHATSAPP_PROVIDER === "meta" && !data.WHATSAPP_WEBHOOK_SECRET) {
    throw new Error("WHATSAPP_WEBHOOK_SECRET is required in production when WHATSAPP_PROVIDER=meta");
  }
  if (
    data.WHATSAPP_PROVIDER === "zapi" &&
    !data.WHATSAPP_WEBHOOK_SECRET &&
    !data.ZAPI_WEBHOOK_TOKEN
  ) {
    throw new Error("WHATSAPP_WEBHOOK_SECRET or ZAPI_WEBHOOK_TOKEN is required in production when WHATSAPP_PROVIDER=zapi");
  }
}

export const ENV = {
  ...data,
  DATABASE_URL: resolvedDatabaseUrl,
  REFRESH_SECRET: data.REFRESH_SECRET ?? data.JWT_SECRET,
  CHAOS_ENABLED: data.CHAOS_ENABLED === "true",
};
