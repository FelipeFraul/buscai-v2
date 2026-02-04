import { pgEnum, pgTable, integer, text, timestamp, uuid, boolean, jsonb } from "drizzle-orm/pg-core";

import { cities, niches } from "../catalog/catalog.schema";
import { users } from "../auth/auth.schema";

const SERPAPI_RUN_STATUSES = ["pending", "running", "done", "failed", "invalidated"] as const;

export const serpapiRunStatusEnum = pgEnum("serpapi_import_status", SERPAPI_RUN_STATUSES as readonly string[]);

export const SERPAPI_RECORD_STATUSES = ["inserted", "updated", "conflict", "ignored", "error"] as const;

export const serpapiRecordStatusEnum = pgEnum("serpapi_record_status", SERPAPI_RECORD_STATUSES as readonly string[]);
export const serpapiImportRuns = pgTable("serpapi_import_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  status: serpapiRunStatusEnum("status").notNull().default("pending"),
  initiatedByUserId: uuid("initiated_by_user_id").references(() => users.id),
  cityId: uuid("city_id").references(() => cities.id),
  nicheId: uuid("niche_id").references(() => niches.id),
  query: text("query"),
  paramsJson: text("params_json"),
  dryRun: boolean("dry_run").notNull().default(false),
  foundCount: integer("found_count").notNull().default(0),
  insertedCount: integer("inserted_count").notNull().default(0),
  updatedCount: integer("updated_count").notNull().default(0),
  conflictCount: integer("conflict_count").notNull().default(0),
  errorCount: integer("error_count").notNull().default(0),
  dedupedCount: integer("deduped_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export const serpapiApiKeys = pgTable("serpapi_api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  apiKeyEncrypted: text("api_key_encrypted").notNull(),
  label: text("label"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
});

export const serpapiSettings = pgTable("serpapi_settings", {
  id: text("id").primaryKey(),
  apiKeyEncrypted: text("api_key_encrypted").notNull(),
  apiKeyUpdatedAt: timestamp("api_key_updated_at", { withTimezone: true }).notNull().defaultNow(),
  activeApiKeyId: uuid("active_api_key_id").references(() => serpapiApiKeys.id),
});

export const serpapiImportRecords = pgTable("serpapi_import_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id").notNull().references(() => serpapiImportRuns.id),
  cityId: uuid("city_id").references(() => cities.id),
  nicheId: uuid("niche_id").references(() => niches.id),
  rawPayload: text("raw_payload").notNull(),
  normalizedPayload: jsonb("normalized_payload"),
  dedupeKey: text("dedupe_key").notNull(),
  companyId: uuid("company_id"),
  status: serpapiRecordStatusEnum("status").notNull().default("inserted"),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  publishStatus: text("publish_status"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  publishedByUserId: uuid("published_by_user_id").references(() => users.id),
});

export type SerpapiRecordStatus =
  | "inserted"
  | "updated"
  | "conflict"
  | "ignored"
  | "error";
