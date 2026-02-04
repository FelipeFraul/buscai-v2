import { boolean, index, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

import { niches } from "../catalog/catalog.schema";
import { users } from "../auth/auth.schema";

export const whatsappQueryEvents = pgTable(
  "whatsapp_query_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    phone: varchar("phone", { length: 32 }).notNull(),
    nicheId: uuid("niche_id").references(() => niches.id).notNull(),
    queryText: text("query_text"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    phoneIdx: index("whatsapp_query_events_phone_idx").on(table.phone),
    phoneCreatedIdx: index("whatsapp_query_events_phone_created_idx").on(
      table.phone,
      table.createdAt
    ),
    nicheIdx: index("whatsapp_query_events_niche_idx").on(table.nicheId),
  })
);

export const whatsappBlocks = pgTable(
  "whatsapp_blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    phone: varchar("phone", { length: 32 }).notNull(),
    reason: varchar("reason", { length: 64 }).notNull(),
    message: text("message"),
    blockedUntil: timestamp("blocked_until", { withTimezone: true }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    phoneIdx: index("whatsapp_blocks_phone_idx").on(table.phone),
    activeIdx: index("whatsapp_blocks_active_idx").on(table.isActive),
    blockedUntilIdx: index("whatsapp_blocks_blocked_until_idx").on(table.blockedUntil),
  })
);
