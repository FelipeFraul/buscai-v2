import { and, eq } from "drizzle-orm";

import { db } from "../../core/database/client";

import { cities, niches } from "./catalog.schema";

type CityRecord = typeof cities.$inferSelect;
type NicheRecord = typeof niches.$inferSelect;

export class CatalogRepository {
  async fetchCities(filters?: Partial<CityRecord>): Promise<CityRecord[]> {
    const where = [];

    if (filters?.isActive !== undefined) {
      where.push(eq(cities.isActive, filters.isActive));
    }

    if (where.length === 0) {
      return db.select().from(cities);
    }

    return db.select().from(cities).where(and(...where));
  }

  async fetchNiches(filters?: Partial<NicheRecord>): Promise<NicheRecord[]> {
    const where = [];

    if (filters?.isActive !== undefined) {
      where.push(eq(niches.isActive, filters.isActive));
    }

    if (where.length === 0) {
      return db.select().from(niches);
    }

    return db.select().from(niches).where(and(...where));
  }

  async fetchProductPlans(): Promise<never> {
    return Promise.reject(new Error("Not implemented"));
  }
}
