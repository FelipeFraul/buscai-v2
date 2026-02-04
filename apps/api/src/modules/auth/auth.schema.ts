import { index, integer, pgEnum, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["admin", "company_owner"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: userRoleEnum("role").notNull().default("company_owner"),
  tokenVersion: integer("token_version").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const authTokenState = pgTable("auth_token_state", {
  id: text("id").primaryKey().notNull().default("global"),
  globalVersion: integer("global_version").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id).notNull(),
    companyId: uuid("company_id"),
    tokenHash: text("token_hash").notNull(),
    ipHash: varchar("ip_hash", { length: 128 }),
    uaHash: varchar("ua_hash", { length: 128 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    replacedByTokenId: uuid("replaced_by_token_id"),
  },
  (table) => ({
    userIdx: index("refresh_tokens_user_id_idx").on(table.userId),
    expiresIdx: index("refresh_tokens_expires_at_idx").on(table.expiresAt),
    companyIdx: index("refresh_tokens_company_id_idx").on(table.companyId),
  })
);
