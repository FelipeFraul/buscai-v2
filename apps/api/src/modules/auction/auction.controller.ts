import {
  AuctionConfigInputSchema,
  AuctionConfigQuerySchema,
  AuctionSlotQuerySchema,
  AuctionSummaryQuerySchema,
} from "@buscai/shared-schema";
import { FastifyReply, FastifyRequest } from "fastify";
import { AuctionService } from "./auction.service";
import { logger } from "../../core/logger";
import { CompaniesRepository } from "../companies/companies.repository";

export class AuctionController {
  constructor(
    private readonly auctionService: AuctionService,
    private readonly companiesRepository: CompaniesRepository
  ) {}

  async listConfigs(request: FastifyRequest, reply: FastifyReply) {
    const actor = request.user;
    if (!actor) {
      return reply.status(401).send();
    }

    const query = AuctionConfigQuerySchema.parse(request.query ?? {});
    let enforcedCompanyId = actor.role === "company_owner" ? actor.companyId : query.companyId;
    if (actor.role === "company_owner" && query.companyId && query.companyId !== actor.companyId) {
      const owned = await this.companiesRepository.getCompanyByIdForOwner(query.companyId, actor.id);
      if (!owned) {
        return reply.status(403).send();
      }
      enforcedCompanyId = query.companyId;
    }

    if (actor.role === "company_owner" && !enforcedCompanyId) {
      return reply.status(403).send();
    }

    const configs = await this.auctionService.listConfigs({
      ...query,
      companyId: enforcedCompanyId ?? undefined,
    });
    return reply.send(configs);
  }

  async upsertConfig(request: FastifyRequest, reply: FastifyReply) {
    const actor = request.user;
    if (!actor) {
      return reply.status(401).send();
    }

    const raw = (request.body ?? {}) as Record<string, unknown>;
    let companyId = actor.role === "company_owner" ? actor.companyId : (raw.companyId as string | undefined);
    if (actor.role === "company_owner" && raw.companyId && raw.companyId !== actor.companyId) {
      const owned = await this.companiesRepository.getCompanyByIdForOwner(String(raw.companyId), actor.id);
      if (!owned) {
        return reply.status(403).send();
      }
      companyId = String(raw.companyId);
    }

    if (actor.role === "company_owner" && !companyId) {
      return reply.status(403).send();
    }
    if (!companyId) {
      return reply.status(400).send({ message: "company_id_required" });
    }

    const payload = AuctionConfigInputSchema.parse({ ...raw, companyId });

    logger.info("auction.config.upsert", {
      actorId: actor.id,
      role: actor.role,
      companyId,
      cityId: payload.cityId,
      nicheId: payload.nicheId,
      mode: payload.mode,
      isActive: payload.isActive,
    });

    const config = await this.auctionService.upsertConfig(payload);
    return reply.send(config);
  }

  async listSlots(request: FastifyRequest, reply: FastifyReply) {
    const query = AuctionSlotQuerySchema.parse(request.query ?? {});
    const slots = await this.auctionService.listSlots(query);
    return reply.send(slots);
  }

  async getSummary(request: FastifyRequest, reply: FastifyReply) {
    const actor = request.user;
    if (!actor) {
      return reply.status(401).send();
    }

    const query = AuctionSummaryQuerySchema.parse(request.query ?? {});
    let companyId = actor.role === "company_owner" ? actor.companyId : query.companyId;
    if (actor.role === "company_owner" && query.companyId && query.companyId !== actor.companyId) {
      const owned = await this.companiesRepository.getCompanyByIdForOwner(query.companyId, actor.id);
      if (!owned) {
        return reply.status(403).send();
      }
      companyId = query.companyId;
    }

    if (actor.role === "company_owner" && !companyId) {
      return reply.status(403).send();
    }

    if (actor.role === "admin" && !companyId) {
      return reply.status(400).send();
    }

    const summary = await this.auctionService.getSummary({
      companyId: companyId ?? "",
      cityId: query.cityId,
      nicheId: query.nicheId,
    });

    return reply.send(summary);
  }
}
