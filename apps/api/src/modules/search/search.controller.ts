import {
  SearchClickInputSchema,
  SearchClickParamsSchema,
  SearchRequestSchema,
} from "@buscai/shared-schema";
import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { AppError } from "../../core/errors";
import { incrementCounter, recordTimer } from "../../core/metrics";
import { SearchService } from "./search.service";

const PublicSearchRequestSchema = z.object({
  text: z.string().min(1),
  city: z.string().min(1),
  niche: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(7).optional(),
});

const SearchEventParamsSchema = z.object({
  searchId: z.string().uuid(),
});

const SearchEventSchema = z.object({
  type: z.enum(["impression", "click_whatsapp", "click_call"]),
  companyId: z.string().uuid().optional(),
});

const RedirectParamsSchema = z.object({
  searchId: z.string().uuid(),
  companyId: z.string().uuid(),
});

export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  async search(request: FastifyRequest, reply: FastifyReply) {
    const payload = SearchRequestSchema.parse(request.body ?? {});
    const start = Date.now();
    try {
      const results = await this.searchService.search(payload);
      incrementCounter("search_requests_total");
      recordTimer("search_avg_latency_ms", Date.now() - start);
      return reply.send(results);
    } catch (error) {
      const status = error instanceof AppError ? error.statusCode : 500;
      if (status >= 500) {
        incrementCounter("search_requests_5xx");
      }
      recordTimer("search_avg_latency_ms", Date.now() - start);
      throw error;
    }
  }

  async publicSearch(request: FastifyRequest, reply: FastifyReply) {
    const payload = PublicSearchRequestSchema.parse(request.body ?? {});
    const results = await this.searchService.publicSearch(payload);
    return reply.send(results);
  }

  async trackEvent(request: FastifyRequest, reply: FastifyReply) {
    const params = SearchEventParamsSchema.parse(request.params ?? {});
    const payload = SearchEventSchema.parse(request.body ?? {});
    await this.searchService.trackEvent(params.searchId, payload);
    return reply.status(204).send();
  }

  async registerClick(request: FastifyRequest, reply: FastifyReply) {
    const params = SearchClickParamsSchema.parse(request.params ?? {});
    const payload = SearchClickInputSchema.parse(request.body ?? {});
    await this.searchService.registerClick(params.searchId, payload);
    return reply.status(204).send();
  }

  async redirectWhatsapp(request: FastifyRequest, reply: FastifyReply) {
    const parsed = RedirectParamsSchema.safeParse(request.params ?? {});
    if (!parsed.success) {
      return reply.status(404).send();
    }

    try {
      const url = await this.searchService.buildTrackingRedirect({
        ...parsed.data,
        type: "click_whatsapp",
      });
      return reply.redirect(url);
    } catch (error) {
      if (error instanceof AppError) {
        return reply.status(error.statusCode).send({ message: error.message });
      }
      throw error;
    }
  }

  async redirectCall(request: FastifyRequest, reply: FastifyReply) {
    const parsed = RedirectParamsSchema.safeParse(request.params ?? {});
    if (!parsed.success) {
      return reply.status(404).send();
    }

    try {
      const url = await this.searchService.buildTrackingRedirect({
        ...parsed.data,
        type: "click_call",
      });
      return reply.redirect(url);
    } catch (error) {
      if (error instanceof AppError) {
        return reply.status(error.statusCode).send({ message: error.message });
      }
      throw error;
    }
  }
}
