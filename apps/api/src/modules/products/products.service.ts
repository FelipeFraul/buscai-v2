import {
  ProductOfferCreateInputSchema,
  ProductOfferUpdateInputSchema,
  ProductSubscriptionBodySchema,
  ProductOffersQuerySchema,
  ProductSearchRequestSchema,
  ProductSearchResponseSchema,
} from "@buscai/shared-schema";
import type { components } from "@buscai/shared-schema/src/api-types";
import { z } from "zod";

import { AppError } from "../../core/errors";
import { CompaniesRepository } from "../companies/companies.repository";
import { InternalAuditService } from "../internal-audit/internal-audit.service";
import { NotificationsService } from "../notifications/notifications.service";

import {
  mapOfferToDto,
  mapPlanToDto,
  mapSubscriptionToDto,
} from "./products.mapper";
import type {
  ProductsRepository,
  CompanySubscriptionWithPlan,
  ProductSearchRow,
} from "./products.repository";

type ProductOfferCreateInput = z.infer<typeof ProductOfferCreateInputSchema>;
type ProductOfferUpdateInput = z.infer<typeof ProductOfferUpdateInputSchema>;
type ProductSubscriptionBody = z.infer<typeof ProductSubscriptionBodySchema>;
type ProductOffersQuery = z.infer<typeof ProductOffersQuerySchema>;
type ProductSearchRequest = z.infer<typeof ProductSearchRequestSchema>;

type ProductOfferDto = components["schemas"]["ProductOffer"];
type ProductPlanDto = components["schemas"]["ProductPlan"];
type CompanyProductSubscriptionDto = components["schemas"]["Subscription"];
type ProductSearchResponse = z.infer<typeof ProductSearchResponseSchema>;

export class ProductsService {
  constructor(
    private readonly productsRepository: ProductsRepository,
    private readonly companiesRepository: CompaniesRepository,
    private readonly auditService: InternalAuditService,
    private readonly notificationsService?: NotificationsService
  ) {}

  async listProductPlans(): Promise<ProductPlanDto[]> {
    const plans = await this.productsRepository.getActiveProductPlans();
    return plans.map((plan) => mapPlanToDto(plan));
  }

  async getCompanySubscription(
    ownerId: string,
    companyId: string
  ): Promise<CompanyProductSubscriptionDto> {
    await this.ensureCompanyOwnership(ownerId, companyId);
    const subscription = await this.productsRepository.getCompanySubscription(companyId);
    if (!subscription) {
      throw new AppError(404, "subscription_not_found");
    }
    return mapSubscriptionToDto(subscription);
  }

  async setCompanySubscription(
    ownerId: string,
    companyId: string,
    payload: ProductSubscriptionBody
  ): Promise<CompanyProductSubscriptionDto> {
    await this.ensureCompanyOwnership(ownerId, companyId);
    const plan = await this.productsRepository.findPlanById(payload.planId);
    if (!plan || !plan.isActive) {
      throw new AppError(400, "invalid_plan");
    }

    const subscription = await this.productsRepository.setCompanySubscription(
      companyId,
      payload.planId
    );

    if (!subscription) {
      throw new AppError(500, "subscription_creation_failed");
    }

    return mapSubscriptionToDto(subscription);
  }

  async getSelfSubscription(actor: { userId: string; role: "company_owner" | "admin"; companyId?: string }) {
    const companyId = this.resolveCompanyId(actor);
    if (!companyId) {
      return { plan: null, status: null as const };
    }

    const subscription = await this.productsRepository.getCompanySubscription(companyId);
    if (!subscription) {
      return { plan: null, status: null as const };
    }

    if (!subscription.plan) {
      return { plan: null, status: subscription.subscription.status ?? null };
    }

    return {
      plan: mapPlanToDto(subscription.plan),
      status: (subscription.subscription.status ?? null) as
        | "active"
        | "past_due"
        | "cancelled"
        | null,
    };
  }

  async changeSelfSubscription(actor: { userId: string; role: "company_owner" | "admin"; companyId?: string }, planId: string) {
    const companyId = this.ensureCompanyId(actor);
    if (actor.role !== "admin") {
      await this.ensureCompanyOwnership(actor.userId, companyId);
    }

    const plan = await this.productsRepository.findPlanById(planId);
    if (!plan || !plan.isActive) {
      throw new AppError(400, "invalid_plan");
    }

    const current = await this.productsRepository.getCompanySubscription(companyId);
    if (
      current &&
      current.subscription.status === "active" &&
      current.subscription.planId === planId
    ) {
      return {
        subscriptionId: current.subscription.id,
        planId,
        status: current.subscription.status,
      };
    }

    if (current?.plan && current.subscription.status === "active") {
      if (plan.monthlyPriceCents < current.plan.monthlyPriceCents) {
        const scheduled = await this.productsRepository.schedulePlanChange(
          companyId,
          planId
        );
        if (!scheduled) {
          throw new AppError(500, "subscription_schedule_failed");
        }

        await this.notificationsService?.notifyEvent({
          companyId,
          category: "subscription",
          severity: "medium",
          kind: "event",
          title: "Downgrade agendado",
          message: "Seu plano sera alterado no proximo ciclo.",
          ctaLabel: "Ver assinatura",
          ctaUrl: "/configuracoes",
          metadata: {
            planId,
            subscriptionId: scheduled.subscription.id,
          },
        });

        return {
          subscriptionId: scheduled.subscription.id,
          planId: scheduled.subscription.planId,
          status: scheduled.subscription.status,
          scheduledPlanId: scheduled.subscription.scheduledPlanId ?? undefined,
        };
      }
    }

    const subscription = await this.productsRepository.setCompanySubscription(
      companyId,
      planId
    );

    if (!subscription) {
      throw new AppError(500, "subscription_creation_failed");
    }

    return {
      subscriptionId: subscription.subscription.id,
      planId: subscription.subscription.planId,
      status: subscription.subscription.status,
    };
  }

  async listCompanyOffers(
    ownerId: string,
    companyId: string,
    query: ProductOffersQuery
  ) {
    await this.ensureCompanyOwnership(ownerId, companyId);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const result = await this.productsRepository.listProductOffersForCompany(
      companyId,
      page,
      pageSize
    );

    return {
      items: result.items.map((offer) => mapOfferToDto(offer)),
      total: result.total,
      page,
      pageSize,
    };
  }

  async createProductOffer(
    ownerId: string,
    companyId: string,
    payload: ProductOfferCreateInput
  ): Promise<ProductOfferDto> {
    const subscription = await this.ensureActiveSubscription(ownerId, companyId);
    await this.ensureOfferLimit(companyId, subscription);

    const offer = await this.productsRepository.createProductOffer(companyId, {
      ...payload,
      originalPriceCents: payload.originalPriceCents ?? null,
      isActive: payload.isActive ?? true,
    });

    return mapOfferToDto(offer);
  }

  async updateProductOffer(
    ownerId: string,
    companyId: string,
    offerId: string,
    payload: ProductOfferUpdateInput
  ): Promise<ProductOfferDto> {
    await this.ensureCompanyOwnership(ownerId, companyId);
    const existing = await this.productsRepository.getProductOfferById(companyId, offerId);

    if (!existing) {
      throw new AppError(404, "product_offer_not_found");
    }

    if (payload.isActive === true && existing.isActive === false) {
      const subscription = await this.ensureActiveSubscription(ownerId, companyId);
      await this.ensureOfferLimit(companyId, subscription);
    }

    const updated = await this.productsRepository.updateProductOffer(companyId, offerId, {
      ...payload,
      originalPriceCents:
        payload.originalPriceCents === undefined
          ? undefined
          : payload.originalPriceCents ?? null,
    });

    if (!updated) {
      throw new AppError(500, "product_offer_update_failed");
    }

    return mapOfferToDto(updated);
  }

  async getProductOffer(
    ownerId: string,
    companyId: string,
    offerId: string
  ): Promise<ProductOfferDto> {
    await this.ensureCompanyOwnership(ownerId, companyId);
    const existing = await this.productsRepository.getProductOfferById(companyId, offerId);
    if (!existing) {
      throw new AppError(404, "product_offer_not_found");
    }
    return mapOfferToDto(existing);
  }

  async deactivateProductOffer(
    ownerId: string,
    companyId: string,
    offerId: string
  ): Promise<void> {
    await this.ensureCompanyOwnership(ownerId, companyId);
    const existing = await this.productsRepository.getProductOfferById(companyId, offerId);
    if (!existing) {
      throw new AppError(404, "product_offer_not_found");
    }

    const updated = await this.productsRepository.updateProductOffer(companyId, offerId, {
      isActive: false,
    });

    if (!updated) {
      throw new AppError(500, "product_offer_update_failed");
    }
  }

  async renewProductOffer(
    ownerId: string,
    companyId: string,
    offerId: string
  ): Promise<ProductOfferDto> {
    await this.ensureCompanyOwnership(ownerId, companyId);
    const existing = await this.productsRepository.getProductOfferById(companyId, offerId);

    if (!existing) {
      throw new AppError(404, "product_offer_not_found");
    }

    if (existing.isActive === false) {
      throw new AppError(400, "product_inactive");
    }

    const subscription = await this.ensureActiveSubscription(ownerId, companyId);
    // Renewal does not change active count; just ensure subscription is valid.
    const now = new Date();
    const updated = await this.productsRepository.renewProductOffer(companyId, offerId, now);

    if (!updated) {
      throw new AppError(500, "product_offer_update_failed");
    }

    await this.auditService.logEvent({
      type: "product_offer_renewed",
      payload: {
        companyId,
        productId: offerId,
        renewedAt: now.toISOString(),
      },
    });

    return mapOfferToDto(updated);
  }

  async searchProductOffers(
    payload: ProductSearchRequest
  ): Promise<ProductSearchResponse> {
    const city = await this.productsRepository.findCityById(payload.cityId);
    if (!city) {
      throw new AppError(404, "city_not_found");
    }

    if (payload.nicheId) {
      const niche = await this.productsRepository.findNicheById(payload.nicheId);
      if (!niche) {
        throw new AppError(404, "niche_not_found");
      }
    }

    const limit = Math.min(payload.limit ?? 5, 5);
    const result = await this.productsRepository.searchProductOffers({
      cityId: payload.cityId,
      nicheId: payload.nicheId,
      query: payload.query,
      limit,
    });

    await this.auditService.logEvent({
      type: "search_performed",
      payload: {
        source: "product",
        cityId: payload.cityId,
        nicheId: payload.nicheId,
        query: payload.query ?? "",
        totalResults: result.items.length,
      },
    });

    return {
      items: result.items.map((row) => this.mapSearchResult(row)),
      total: result.total,
    };
  }

  mapSearchResult(row: ProductSearchRow): ProductSearchResponse["items"][number] {
    const createdAt = row.offer.createdAt ?? new Date();
    const validUntil = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000);
    return {
      id: row.offer.id,
      title: row.offer.title,
      priceCents: row.offer.priceCents,
      validUntil: validUntil.toISOString(),
      company: {
        id: row.company.id,
        name: row.company.tradeName ?? undefined,
        phone: row.company.phone ?? undefined,
        address: row.company.address ?? undefined,
      },
      city: {
        id: row.city.id,
        name: row.city.name ?? undefined,
      },
      source: "product",
    };
  }

  private async ensureCompanyOwnership(ownerId: string, companyId: string): Promise<void> {
    const company = await this.companiesRepository.getCompanyByIdForOwner(
      companyId,
      ownerId
    );

    if (!company) {
      throw new AppError(404, "company_not_found");
    }
  }

  private resolveCompanyId(actor: { userId: string; role: "company_owner" | "admin"; companyId?: string }): string | null {
    if (actor.role === "company_owner") {
      return actor.companyId ?? null;
    }
    return actor.companyId ?? null;
  }

  private ensureCompanyId(actor: { userId: string; role: "company_owner" | "admin"; companyId?: string }): string {
    const companyId = this.resolveCompanyId(actor);
    if (!companyId) {
      throw new AppError(403, "company_required");
    }
    return companyId;
  }

  private async ensureActiveSubscription(
    ownerId: string,
    companyId: string
  ): Promise<CompanySubscriptionWithPlan> {
    await this.ensureCompanyOwnership(ownerId, companyId);
    const subscription = await this.productsRepository.getCompanySubscription(companyId);
    if (!subscription) {
      throw new AppError(400, "subscription_required");
    }

    if (subscription.subscription.status !== "active") {
      throw new AppError(400, "subscription_plan_inactive");
    }

    if (!subscription.plan.isActive) {
      throw new AppError(400, "subscription_plan_inactive");
    }

    return subscription;
  }

  private async ensureOfferLimit(
    companyId: string,
    subscription: CompanySubscriptionWithPlan
  ): Promise<void> {
    const count = await this.productsRepository.countActiveOffersForCompany(companyId);
    if (count >= subscription.plan.maxActiveOffers) {
      throw new AppError(400, "product_limit_reached");
    }
  }
}
