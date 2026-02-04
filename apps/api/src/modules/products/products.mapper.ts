import type { components } from "@buscai/shared-schema/src/api-types";

import type {
  CompanySubscriptionWithPlan,
  ProductPlanRecord,
  ProductOfferRecord,
} from "./products.repository";

export function mapPlanToDto(plan: ProductPlanRecord): components["schemas"]["ProductPlan"] {
  return {
    id: plan.id,
    name: plan.name,
    description: plan.description,
    monthlyPriceCents: plan.monthlyPriceCents,
    maxActiveOffers: plan.maxActiveOffers,
    isActive: plan.isActive ?? undefined,
    createdAt: plan.createdAt?.toISOString(),
    updatedAt: plan.updatedAt?.toISOString(),
  };
}

export function mapSubscriptionToDto(
  subscription: CompanySubscriptionWithPlan
): components["schemas"]["Subscription"] {
  return {
    id: subscription.subscription.id,
    companyId: subscription.subscription.companyId,
    planId: subscription.subscription.planId,
    status: subscription.subscription.status,
    currentPeriodStart: subscription.subscription.currentPeriodStart?.toISOString(),
    currentPeriodEnd: subscription.subscription.currentPeriodEnd?.toISOString(),
    graceUntil: subscription.subscription.graceUntil?.toISOString() ?? undefined,
    scheduledPlanId: subscription.subscription.scheduledPlanId ?? undefined,
    paymentMethod: subscription.subscription.paymentMethod ?? undefined,
    plan: mapPlanToDto(subscription.plan),
  };
}

export function mapOfferToDto(
  offer: ProductOfferRecord
): components["schemas"]["ProductOffer"] {
  return {
    id: offer.id,
    companyId: offer.companyId,
    cityId: offer.cityId,
    nicheId: offer.nicheId,
    title: offer.title,
    description: offer.description,
    priceCents: offer.priceCents,
    originalPriceCents: offer.originalPriceCents ?? undefined,
    isActive: offer.isActive ?? undefined,
    createdAt: offer.createdAt?.toISOString(),
    updatedAt: offer.updatedAt?.toISOString() ?? undefined,
  };
}
