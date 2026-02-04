import { z } from "zod";
import type { FastifyReply, FastifyRequest } from "fastify";

import { SearchService } from "../search/search.service";
import { OfferedByService } from "./offered-by.service";
import { logger } from "../../core/logger";
import { ENV } from "../../config/env";
import { verifyOfferedByTrackingToken } from "./offered-by-tracking";

const configPayloadSchema = z.object({
  companyId: z.string().uuid(),
  cityId: z.string().uuid().nullable().optional(),
  nicheId: z.string().uuid().nullable().optional(),
  text: z.string().min(1).max(160).nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  website: z.string().url().nullable().optional(),
  promotionsUrl: z.string().url().nullable().optional(),
  phoneE164: z.string().min(6).max(32).nullable().optional(),
  whatsappE164: z.string().min(6).max(32).nullable().optional(),
  isActive: z.boolean().optional(),
});

const offeredByEventSchema = z.object({
  type: z.enum([
    "click_whatsapp",
    "click_call",
    "click_site",
    "click_promotions",
  ]),
  searchId: z.string().uuid().optional(),
  source: z.enum(["web", "whatsapp", "demo"]).optional(),
});

const offeredByDashboardQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

export class OfferedByController {
  constructor(
    private readonly offeredByService: OfferedByService,
    private readonly searchService?: SearchService
  ) {}

  async listConfigs(request: FastifyRequest, reply: FastifyReply) {
    const query = z
      .object({
        companyId: z.string().uuid().optional(),
        cityId: z.string().uuid().optional(),
        nicheId: z.string().uuid().optional(),
        isActive: z.string().optional(),
      })
      .parse(request.query ?? {});

    const isActive =
      typeof query.isActive === "string"
        ? query.isActive === "true"
        : undefined;

    const configs = await this.offeredByService.listConfigs({
      companyId: query.companyId,
      cityId: query.cityId,
      nicheId: query.nicheId,
      isActive,
    });
    return reply.send(configs);
  }

  async createConfig(request: FastifyRequest, reply: FastifyReply) {
    const actor = request.user;
    if (!actor) {
      return reply.status(401).send();
    }
    const payload = configPayloadSchema.parse(request.body ?? {});
    const created = await this.offeredByService.createConfig({
      ...payload,
      createdByUserId: actor.id,
    });
    return reply.send(created);
  }

  async updateConfig(request: FastifyRequest, reply: FastifyReply) {
    const params = z.object({ id: z.string().uuid() }).parse(request.params ?? {});
    const payload = configPayloadSchema.parse(request.body ?? {});
    const updated = await this.offeredByService.updateConfig(params.id, payload);
    if (!updated) {
      return reply.status(404).send();
    }
    return reply.send(updated);
  }

  async enableConfig(request: FastifyRequest, reply: FastifyReply) {
    const params = z.object({ id: z.string().uuid() }).parse(request.params ?? {});
    await this.offeredByService.setActive(params.id, true);
    return reply.send({ ok: true });
  }

  async disableConfig(request: FastifyRequest, reply: FastifyReply) {
    const params = z.object({ id: z.string().uuid() }).parse(request.params ?? {});
    await this.offeredByService.setActive(params.id, false);
    return reply.send({ ok: true });
  }

  async dashboard(request: FastifyRequest, reply: FastifyReply) {
    const params = z.object({ id: z.string().uuid() }).parse(request.params ?? {});
    const query = offeredByDashboardQuerySchema.parse(request.query ?? {});
    const result = await this.offeredByService.getDashboard({
      configId: params.id,
      from: query.from,
      to: query.to,
    });
    return reply.send(result);
  }

  async trackEvent(request: FastifyRequest, reply: FastifyReply) {
    const params = z.object({ id: z.string().uuid() }).parse(request.params ?? {});
    const payload = offeredByEventSchema.parse(request.body ?? {});
    const configRow = await this.offeredByService.getConfigRow(params.id);
    const config = configRow.config;

    let cityId: string | null = config.cityId ?? null;
    let nicheId: string | null = config.nicheId ?? null;
    let source = payload.source ?? "web";
    let searchType: "niche" | "company" | "product" = "niche";

    logger.info("offered_by.event.received", {
      configId: params.id,
      type: payload.type,
      source: payload.source ?? "web",
      searchId: payload.searchId ?? null,
    });

    if (payload.searchId && this.searchService) {
      const search = await this.searchService.findSearchById(payload.searchId);
      if (search) {
        cityId = search.cityId ?? cityId;
        nicheId = search.nicheId ?? nicheId;
        source = search.source ?? source;
      }
      logger.info("offered_by.event.search_context", {
        configId: params.id,
        searchId: payload.searchId,
        found: Boolean(search),
        cityId,
        nicheId,
        source,
      });
    }

    logger.info("offered_by.event.recording", {
      configId: config.id,
      companyId: config.companyId,
      type: payload.type,
      source,
      cityId,
      nicheId,
      searchType,
      searchId: payload.searchId ?? null,
    });

    await this.offeredByService.recordEvent({
      configId: config.id,
      companyId: config.companyId,
      searchId: payload.searchId ?? null,
      cityId,
      nicheId,
      source,
      type: payload.type,
      searchType,
    });

    logger.info("offered_by.event.recorded", {
      configId: config.id,
      type: payload.type,
      searchId: payload.searchId ?? null,
    });

    return reply.status(204).send();
  }

  async redirect(request: FastifyRequest, reply: FastifyReply) {
    const params = z.object({ token: z.string().min(10) }).parse(request.params ?? {});
    logger.info("offered_by.redirect.hit", {
      tokenPrefix: params.token.slice(0, 12),
      userAgent: request.headers["user-agent"],
      ip: request.ip,
    });
    const payload = verifyOfferedByTrackingToken(params.token, ENV.JWT_SECRET);
    if (!payload) {
      logger.info("offered_by.redirect.invalid", { token: params.token.slice(0, 12) });
      return reply.status(400).send();
    }
    logger.info("offered_by.redirect.decoded", {
      configId: payload.configId,
      companyId: payload.companyId,
      type: payload.type,
      cityId: payload.cityId ?? null,
      nicheId: payload.nicheId ?? null,
      searchType: payload.searchType ?? "niche",
      source: payload.source ?? "whatsapp",
    });

    const row = await this.offeredByService.getConfigRow(payload.configId);
    const config = row.config;
    const company = row.company;

    const normalizeDigits = (value?: string | null) => value?.replace(/\D/g, "") ?? "";
    const resolveTarget = () => {
      if (payload.type === "click_whatsapp") {
        const raw = config.whatsappE164 ?? company?.whatsapp ?? null;
        const digits = normalizeDigits(raw);
        return digits ? `https://wa.me/${digits}` : null;
      }
      if (payload.type === "click_call") {
        const raw = config.phoneE164 ?? company?.phone ?? null;
        const digits = normalizeDigits(raw);
        return digits ? `tel:${digits}` : null;
      }
      if (payload.type === "click_site") {
        return config.website ?? company?.website ?? null;
      }
      if (payload.type === "click_promotions") {
        return config.promotionsUrl ?? null;
      }
      return null;
    };

    const target = resolveTarget();
    if (!target) {
      logger.info("offered_by.redirect.missing_target", {
        configId: payload.configId,
        type: payload.type,
      });
      return reply.status(404).send();
    }

    await this.offeredByService.recordEvent({
      configId: payload.configId,
      companyId: payload.companyId ?? config.companyId,
      searchId: null,
      cityId: payload.cityId ?? null,
      nicheId: payload.nicheId ?? null,
      source: payload.source ?? "whatsapp",
      type: payload.type,
      searchType: payload.searchType ?? "niche",
    });

    logger.info("offered_by.redirect.recorded", {
      configId: payload.configId,
      type: payload.type,
    });

    logger.info("offered_by.redirect.target", {
      configId: payload.configId,
      type: payload.type,
      target,
    });

    return reply.redirect(target);
  }
}
