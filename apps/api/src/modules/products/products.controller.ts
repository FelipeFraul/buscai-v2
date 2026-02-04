import {
  CompanyIdParamSchema,
  ProductOfferCreateInputSchema,
  ProductOfferUpdateInputSchema,
  ProductOffersQuerySchema,
  ProductSearchRequestSchema,
  ProductSubscriptionBodySchema,
} from "@buscai/shared-schema";
import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { AppError } from "../../core/errors";
import { assertWritable } from "../../core/readonly";
import { CompaniesRepository } from "../companies/companies.repository";

import { ProductsService } from "./products.service";

const OfferParamsSchema = CompanyIdParamSchema.extend({
  offerId: z.string().min(1),
});

type LegacyProductPayload = {
  nome?: string;
  descricao?: string;
  preco?: string | number;
  status?: "ativo" | "inativo";
};

type ProductOfferDto = {
  id: string;
  title?: string | null;
  description?: string | null;
  priceCents?: number | null;
  isActive?: boolean | null;
};

export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly companiesRepository?: CompaniesRepository
  ) {}

  async listProductPlans(_request: FastifyRequest, reply: FastifyReply) {
    const plans = await this.productsService.listProductPlans();
    return reply.send(plans);
  }

  async getMySubscription(request: FastifyRequest, reply: FastifyReply) {
    const actor = request.user;
    if (!actor) {
      return reply.status(401).send();
    }

    const companyIdQuery = z.object({ companyId: z.string().optional() }).parse(request.query ?? {});
    if (actor.role === "company_owner" && !actor.companyId) {
      return reply.status(403).send();
    }

    const result = await this.productsService.getSelfSubscription({
      userId: actor.id,
      role: actor.role,
      companyId: actor.role === "admin" ? companyIdQuery.companyId : actor.companyId,
    });

    return reply.send(result);
  }

  async changeMySubscription(request: FastifyRequest, reply: FastifyReply) {
    assertWritable();
    const actor = request.user;
    if (!actor) {
      return reply.status(401).send();
    }

    const body = z.object({ planId: z.string() }).parse(request.body ?? {});

    const companyIdQuery = z.object({ companyId: z.string().optional() }).parse(request.query ?? {});

    const result = await this.productsService.changeSelfSubscription(
      {
        userId: actor.id,
        role: actor.role,
        companyId: actor.role === "admin" ? companyIdQuery.companyId : actor.companyId,
      },
      body.planId
    );

    return reply.send(result);
  }

  async getCompanySubscription(request: FastifyRequest, reply: FastifyReply) {
    const userId = this.requireUserId(request);
    const params = CompanyIdParamSchema.parse(request.params ?? {});
    const subscription = await this.productsService.getCompanySubscription(
      userId,
      params.companyId
    );
    return reply.send(subscription);
  }

  async setCompanySubscription(request: FastifyRequest, reply: FastifyReply) {
    assertWritable();
    const userId = this.requireUserId(request);
    const params = CompanyIdParamSchema.parse(request.params ?? {});
    const body = ProductSubscriptionBodySchema.parse(request.body ?? {});
    const subscription = await this.productsService.setCompanySubscription(
      userId,
      params.companyId,
      body
    );
    return reply.send(subscription);
  }

  async listCompanyOffers(request: FastifyRequest, reply: FastifyReply) {
    const userId = this.requireUserId(request);
    const params = CompanyIdParamSchema.parse(request.params ?? {});
    const query = ProductOffersQuerySchema.parse(request.query ?? {});
    const offers = await this.productsService.listCompanyOffers(
      userId,
      params.companyId,
      query
    );
    return reply.send(offers);
  }

  async createCompanyOffer(request: FastifyRequest, reply: FastifyReply) {
    assertWritable();
    const userId = this.requireUserId(request);
    const params = CompanyIdParamSchema.parse(request.params ?? {});
    const body = ProductOfferCreateInputSchema.parse(request.body ?? {});
    const offer = await this.productsService.createProductOffer(
      userId,
      params.companyId,
      body
    );
    return reply.status(201).send(offer);
  }

  async updateCompanyOffer(request: FastifyRequest, reply: FastifyReply) {
    assertWritable();
    const userId = this.requireUserId(request);
    const params = OfferParamsSchema.parse(request.params ?? {});
    const body = ProductOfferUpdateInputSchema.parse(request.body ?? {});
    const offer = await this.productsService.updateProductOffer(
      userId,
      params.companyId,
      params.offerId,
      body
    );
    return reply.send(offer);
  }

  async searchProducts(request: FastifyRequest, reply: FastifyReply) {
    const source = request.method === "GET" ? request.query : request.body;
    const payload = ProductSearchRequestSchema.parse(source ?? {});
    const results = await this.productsService.searchProductOffers(payload);
    return reply.send(results);
  }

  async listProducts(request: FastifyRequest, reply: FastifyReply) {
    const { userId, companyId } = await this.resolveProductContext(request);
    const query = ProductOffersQuerySchema.parse(request.query ?? {});
    const offers = await this.productsService.listCompanyOffers(userId, companyId, query);
    if (this.isLegacyQuery(request.query)) {
      return reply.send(offers.items.map((offer) => this.toLegacyProduct(offer)));
    }
    return reply.send(offers);
  }

  async getProduct(request: FastifyRequest, reply: FastifyReply) {
    const { userId, companyId } = await this.resolveProductContext(request);
    const params = z.object({ id: z.string() }).parse(request.params ?? {});
    const offer = await this.productsService.getProductOffer(userId, companyId, params.id);
    return reply.send(this.withLegacyFields(offer));
  }

  async createProduct(request: FastifyRequest, reply: FastifyReply) {
    assertWritable();
    const { userId, companyId } = await this.resolveProductContext(request);
    const body = await this.parseCreatePayload(request.body ?? {}, companyId);
    const offer = await this.productsService.createProductOffer(userId, companyId, body);
    return reply.status(201).send(this.withLegacyFields(offer));
  }

  async updateProduct(request: FastifyRequest, reply: FastifyReply) {
    assertWritable();
    const { userId, companyId } = await this.resolveProductContext(request);
    const params = z.object({ id: z.string() }).parse(request.params ?? {});
    const body = this.parseUpdatePayload(request.body ?? {});
    const offer = await this.productsService.updateProductOffer(
      userId,
      companyId,
      params.id,
      body
    );
    return reply.send(this.withLegacyFields(offer));
  }

  async deleteProduct(request: FastifyRequest, reply: FastifyReply) {
    assertWritable();
    const { userId, companyId } = await this.resolveProductContext(request);
    const params = z.object({ id: z.string() }).parse(request.params ?? {});
    await this.productsService.deactivateProductOffer(userId, companyId, params.id);
    return reply.status(204).send();
  }

  async renewProduct(request: FastifyRequest, reply: FastifyReply) {
    assertWritable();
    const { userId, companyId } = await this.resolveProductContext(request);
    const params = z.object({ id: z.string() }).parse(request.params ?? {});
    const offer = await this.productsService.renewProductOffer(userId, companyId, params.id);
    return reply.send(this.withLegacyFields(offer));
  }

  private requireUserId(request: FastifyRequest): string {
    if (!request.user?.id) {
      throw new AppError(401, "Unauthorized");
    }
    return request.user.id;
  }

  private async resolveProductContext(request: FastifyRequest): Promise<{ userId: string; companyId: string }> {
    const userId = this.requireUserId(request);
    const role = request.user?.role ?? "company_owner";

    if (role === "admin") {
      const query = z.object({ companyId: z.string().uuid().optional() }).parse(request.query ?? {});
      const body = z.object({ companyId: z.string().uuid().optional() }).parse(request.body ?? {});
      const companyId = body.companyId ?? query.companyId;
      if (!companyId) {
        throw new AppError(400, "company_id_required");
      }

      if (!this.companiesRepository) {
        throw new AppError(500, "company_repo_unavailable");
      }

      const ownerId = await this.companiesRepository.getCompanyOwnerId(companyId);
      if (!ownerId) {
        throw new AppError(404, "Company not found");
      }

      return { userId: ownerId, companyId };
    }

    if (role !== "company_owner") {
      throw new AppError(403, "Forbidden");
    }

    const companyId = request.user?.companyId;
    if (!companyId) {
      throw new AppError(403, "company_not_linked");
    }

    return { userId, companyId };
  }

  private parsePriceToCents(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.round(value * 100);
    }

    if (typeof value === "string") {
      const normalized = value.replace(",", ".");
      const parsed = Number(normalized);
      if (Number.isFinite(parsed)) {
        return Math.round(parsed * 100);
      }
    }

    return null;
  }

  private mergeLegacyPayload(body: Record<string, unknown>): { merged: Record<string, unknown>; legacy: boolean } {
    const legacyKeys = ["nome", "descricao", "preco", "status"];
    const legacy = legacyKeys.some((key) => Object.prototype.hasOwnProperty.call(body, key));
    if (!legacy) {
      return { merged: body, legacy: false };
    }

    const merged: Record<string, unknown> = { ...body };
    const legacyPayload = body as LegacyProductPayload;

    if (merged.title === undefined && legacyPayload.nome !== undefined) {
      merged.title = legacyPayload.nome;
    }

    if (merged.description === undefined && legacyPayload.descricao !== undefined) {
      merged.description = legacyPayload.descricao;
    }

    if (merged.priceCents === undefined && legacyPayload.preco !== undefined) {
      const cents = this.parsePriceToCents(legacyPayload.preco);
      if (cents === null) {
        throw new AppError(400, "invalid_preco");
      }
      merged.priceCents = cents;
    }

    if (merged.isActive === undefined && legacyPayload.status) {
      merged.isActive = legacyPayload.status === "ativo";
    }

    return { merged, legacy: true };
  }

  private async parseCreatePayload(body: unknown, companyId: string) {
    const raw = (body ?? {}) as Record<string, unknown>;
    const { merged, legacy } = this.mergeLegacyPayload(raw);

    if (legacy && merged.description === undefined) {
      merged.description = "";
    }

    if (!merged.cityId || !merged.nicheId) {
      if (!this.companiesRepository) {
        throw new AppError(500, "company_repo_unavailable");
      }

      const entity = await this.companiesRepository.findCompanyWithNiches(companyId);
      if (!entity) {
        throw new AppError(404, "Company not found");
      }

      if (!merged.cityId) {
        merged.cityId = entity.company.cityId;
      }

      if (!merged.nicheId) {
        merged.nicheId = entity.niches[0]?.id;
      }
    }

    return ProductOfferCreateInputSchema.parse(merged);
  }

  private parseUpdatePayload(body: unknown) {
    const raw = (body ?? {}) as Record<string, unknown>;
    const { merged } = this.mergeLegacyPayload(raw);
    return ProductOfferUpdateInputSchema.parse(merged);
  }

  private isLegacyQuery(query: unknown): boolean {
    if (!query || typeof query !== "object") {
      return false;
    }

    const value = (query as Record<string, unknown>).legacy;
    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "number") {
      return value === 1;
    }

    if (typeof value === "string") {
      return value === "1" || value.toLowerCase() === "true";
    }

    return false;
  }

  private toLegacyProduct(offer: ProductOfferDto) {
    const priceCents = Number(offer.priceCents ?? 0);
    const status = offer.isActive === false ? "inativo" : "ativo";
    return {
      id: offer.id,
      nome: offer.title ?? "",
      descricao: offer.description ?? "",
      preco: priceCents / 100,
      status,
      ativo: status === "ativo",
      aparicoes: 0,
      cliques: 0,
      ctr: 0,
    };
  }

  private withLegacyFields(offer: ProductOfferDto) {
    return {
      ...offer,
      ...this.toLegacyProduct(offer),
    };
  }
}
