import { SearchAnalyticsQuerySchema } from "@buscai/shared-schema";
import { FastifyReply, FastifyRequest } from "fastify";

import { SearchAnalyticsService } from "./search-analytics.service";

export class SearchAnalyticsController {
  constructor(private readonly searchAnalyticsService: SearchAnalyticsService) {}

  async getAnalytics(request: FastifyRequest, reply: FastifyReply) {
    const query = SearchAnalyticsQuerySchema.parse(request.query ?? {});
    const analytics = await this.searchAnalyticsService.getSearchAnalytics(query);
    return reply.send(analytics);
  }
}
