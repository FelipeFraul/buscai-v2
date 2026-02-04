import {
  CompaniesQuerySchema,
  CompanyChannelsInputSchema,
  CompanyClaimInputSchema,
  CompanyCreateInputSchema,
  CompanyIdParamSchema,
  CompanyUpdateInputSchema,
} from "@buscai/shared-schema";
import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { AppError } from "../../core/errors";

import { CompaniesService } from "./companies.service";

const adminCompaniesQuerySchema = z.object({
  cityId: z.string().uuid().optional(),
  nicheId: z.string().uuid().optional(),
  status: z.enum(["draft", "pending", "active", "suspended"]).optional(),
  q: z.string().optional(),
  page: z.coerce.number().optional().default(1),
  limit: z.coerce.number().optional().default(20),
});

const adminCompanyCreateSchema = z.object({
  name: z.string().min(1),
  cityId: z.string().uuid(),
  nicheId: z.string().uuid(),
  addressLine: z.string().min(1),
  phoneE164: z.string().optional(),
  whatsappE164: z.string().optional(),
  website: z.string().url().optional(),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  status: z.enum(["draft", "pending", "active", "suspended"]).optional(),
  origin: z.enum(["serpapi", "manual", "claimed"]).optional(),
  qualityScore: z.coerce.number().int().optional(),
  force: z.boolean().optional(),
});

const adminCompanyUpdateSchema = adminCompanyCreateSchema.partial();
const serpapiCompanyUpdateSchema = z
  .object({
    name: z.string().min(1).optional(),
    address: z.string().optional(),
    phone: z.string().optional(),
    whatsapp: z.string().optional(),
    participatesInAuction: z.boolean().optional(),
    hasWhatsapp: z.boolean().optional(),
  })
  .strict();

const adminCompanyStatusSchema = z.object({
  status: z.enum(["draft", "pending", "active", "suspended"]),
});

export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  async listCompanies(request: FastifyRequest, reply: FastifyReply) {
    const ownerId = this.requireUserId(request);
    const query = CompaniesQuerySchema.parse(request.query ?? {});
    const response = await this.companiesService.listCompanies(ownerId, query);
    return reply.send(response);
  }

  async createCompany(request: FastifyRequest, reply: FastifyReply) {
    const ownerId = this.requireUserId(request);
    const payload = CompanyCreateInputSchema.parse(request.body ?? {});
    const company = await this.companiesService.createCompany(ownerId, payload);
    return reply.status(201).send(company);
  }

  async getCompany(request: FastifyRequest, reply: FastifyReply) {
    const ownerId = this.requireUserId(request);
    const params = CompanyIdParamSchema.parse(request.params ?? {});
    const company = await this.companiesService.getCompanyById(
      ownerId,
      params.companyId
    );
    return reply.send(company);
  }

  async updateCompany(request: FastifyRequest, reply: FastifyReply) {
    const ownerId = this.requireUserId(request);
    const params = CompanyIdParamSchema.parse(request.params ?? {});
    const payload = CompanyUpdateInputSchema.parse(request.body ?? {});
    const company = await this.companiesService.updateCompany(
      ownerId,
      params.companyId,
      payload
    );
    return reply.send(company);
  }

  async claimCompany(request: FastifyRequest, reply: FastifyReply) {
    const params = CompanyIdParamSchema.parse(request.params ?? {});
    const payload = CompanyClaimInputSchema.parse(request.body ?? {});
    const result = await this.companiesService.claimCompany(params.companyId, payload);
    return reply.send(result);
  }

  async updateCompanyChannels(request: FastifyRequest, reply: FastifyReply) {
    const params = CompanyIdParamSchema.parse(request.params ?? {});
    const payload = CompanyChannelsInputSchema.parse(request.body ?? {});
    const result = await this.companiesService.updateCompanyChannels(
      params.companyId,
      payload
    );
    return reply.send(result);
  }

  async getMyCompany(request: FastifyRequest, reply: FastifyReply) {
    if (!request.user) {
      return reply.status(401).send();
    }

    const query = z
      .object({ companyId: z.string().uuid().optional() })
      .parse(request.query ?? {});

    const overview = await this.companiesService.getCompanyOverview({
      role: request.user.role as any,
      companyId: query.companyId ?? request.user.companyId,
      userId: request.user.id,
    });
    return reply.send(overview);
  }

  async searchCompanies(request: FastifyRequest, reply: FastifyReply) {
    if (!request.user) {
      return reply.status(401).send();
    }

    const query = z
      .object({
        q: z.string().min(3),
        cityId: z.string().uuid().optional(),
        limit: z.coerce.number().optional(),
      })
      .parse(request.query ?? {});

    const items = await this.companiesService.searchCompanies({
      q: query.q,
      cityId: query.cityId,
      limit: query.limit,
      excludeCompanyId: request.user.companyId ?? undefined,
    });

    return reply.send({ items });
  }

  async listCompanyNiches(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user?.id;
    if (!userId) {
      throw new AppError(401, "Unauthorized");
    }

    const actor = {
      userId,
      role: (request.user?.role ?? "company_owner") as "company_owner" | "admin",
      companyId: request.user?.companyId,
    };

    const query = CompanyIdParamSchema.partial().safeParse(request.query ?? {});
    const overrideCompanyId = query.success ? query.data.companyId : undefined;

    const niches = await this.companiesService.listCompanyNiches(actor, overrideCompanyId);
    return reply.send(niches);
  }

  async getCompetitiveSummary(request: FastifyRequest, reply: FastifyReply) {
    const params = CompanyIdParamSchema.parse(request.params ?? {});
    const summary = await this.companiesService.getCompetitiveSummary(params.companyId);
    return reply.send(summary);
  }

  async listAdminCompanies(request: FastifyRequest, reply: FastifyReply) {
    const query = adminCompaniesQuerySchema.parse(request.query ?? {});
    const result = await this.companiesService.listAdminCompanies({
      cityId: query.cityId,
      nicheId: query.nicheId,
      status: query.status,
      q: query.q,
      page: query.page,
      limit: query.limit,
    });
    return reply.send(result);
  }

  async createAdminCompany(request: FastifyRequest, reply: FastifyReply) {
    const body = adminCompanyCreateSchema.parse(request.body ?? {});
    const userId = this.requireUserId(request);
    const result = await this.companiesService.createAdminCompany(userId, body);
    if ("conflict" in result && result.conflict) {
      return reply.status(409).send({
        message: "dedupe_conflict",
        dedupeHits: result.dedupeHits,
      });
    }
    return reply.status(201).send(result);
  }

  async getAdminCompany(request: FastifyRequest, reply: FastifyReply) {
    const params = CompanyIdParamSchema.parse(request.params ?? {});
    const result = await this.companiesService.getAdminCompanyById(params.companyId);
    return reply.send(result);
  }

  async updateAdminCompany(request: FastifyRequest, reply: FastifyReply) {
    const params = CompanyIdParamSchema.parse(request.params ?? {});
    const rawBody = request.body ?? {};
    const serpapiPayload = serpapiCompanyUpdateSchema.safeParse(rawBody);
    const body = serpapiPayload.success
      ? {
          name: serpapiPayload.data.name,
          addressLine: serpapiPayload.data.address,
          phoneE164: serpapiPayload.data.phone,
          whatsappE164: serpapiPayload.data.whatsapp,
          participatesInAuction: serpapiPayload.data.participatesInAuction,
          hasWhatsapp: serpapiPayload.data.hasWhatsapp,
        }
      : adminCompanyUpdateSchema.parse(rawBody);
    const result = await this.companiesService.updateAdminCompany(params.companyId, body);
    if ("conflict" in result && result.conflict) {
      return reply.status(409).send({
        message: "dedupe_conflict",
        dedupeHits: result.dedupeHits,
      });
    }
    return reply.send(result);
  }

  async updateAdminCompanyStatus(request: FastifyRequest, reply: FastifyReply) {
    const params = CompanyIdParamSchema.parse(request.params ?? {});
    const body = adminCompanyStatusSchema.parse(request.body ?? {});
    const result = await this.companiesService.setAdminCompanyStatus(params.companyId, body.status);
    return reply.send(result);
  }

  private requireUserId(request: FastifyRequest): string {
    const userId = request.user?.id;
    if (!userId) {
      throw new AppError(401, "Unauthorized");
    }

    return userId;
  }
}
