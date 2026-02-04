import { CitiesQuerySchema, NichesQuerySchema } from "@buscai/shared-schema";
import { FastifyReply, FastifyRequest } from "fastify";

import { CatalogService } from "./catalog.service";

export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  async listCities(request: FastifyRequest, reply: FastifyReply) {
    const query = CitiesQuerySchema.parse(request.query ?? {});
    const cities = await this.catalogService.listCities(query);
    return reply.send(cities);
  }

  async listNiches(request: FastifyRequest, reply: FastifyReply) {
    const query = NichesQuerySchema.parse(request.query ?? {});
    const niches = await this.catalogService.listNiches(query);
    return reply.send(niches);
  }
}
