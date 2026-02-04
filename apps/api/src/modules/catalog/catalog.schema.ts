import { boolean, pgTable, uuid, varchar } from "drizzle-orm/pg-core";

export const cities = pgTable("cities", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  state: varchar("state", { length: 2 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
});

export const niches = pgTable("niches", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: varchar("slug", { length: 128 }).notNull().unique(),
  label: varchar("label", { length: 255 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
});