import { CitiesQuerySchema, NichesQuerySchema } from "@buscai/shared-schema";
import { z } from "zod";

import { CatalogRepository } from "./catalog.repository";

type CitiesQuery = z.infer<typeof CitiesQuerySchema>;
type NichesQuery = z.infer<typeof NichesQuerySchema>;

export class CatalogService {
  constructor(private readonly _catalogRepository: CatalogRepository) {}

  async listCities(_query: CitiesQuery) {
    const cities = await this._catalogRepository.fetchCities({ isActive: true });
    return cities.map((city) => ({
      id: city.id,
      name: city.name,
      state: city.state,
      isActive: city.isActive ?? undefined,
    }));
  }

  async listNiches(_query: NichesQuery) {
    const niches = await this._catalogRepository.fetchNiches({ isActive: true });
    return niches.map((niche) => ({
      id: niche.id,
      label: niche.label,
      slug: niche.slug,
      isActive: niche.isActive ?? undefined,
    }));
  }

}
