import { AppError } from "../../core/errors";
import { ENV } from "../../config/env";
import { BillingRepository } from "../billing/billing.repository";
import type { PaymentGateway } from "../billing/gateway/payment-gateway";
import { ProductsRepository } from "../products/products.repository";
import { NotificationsService } from "../notifications/notifications.service";

import { SubscriptionsRepository } from "./subscriptions.repository";

const GRACE_DAYS = Math.max(0, ENV.SUBSCRIPTION_GRACE_DAYS);

export class SubscriptionsService {
  constructor(
    private readonly subscriptionsRepository: SubscriptionsRepository,
    private readonly productsRepository: ProductsRepository,
    private readonly billingRepository: BillingRepository,
    private readonly gateway: PaymentGateway,
    private readonly notificationsService?: NotificationsService
  ) {}

  async getSubscription(companyId: string) {
    return this.subscriptionsRepository.getCompanySubscription(companyId);
  }

  async scheduleDowngrade(companyId: string, planId: string) {
    const plan = await this.productsRepository.findPlanById(planId);
    if (!plan || !plan.isActive) {
      throw new AppError(400, "invalid_plan");
    }

    const subscription = await this.subscriptionsRepository.getCompanySubscription(companyId);
    if (!subscription) {
      throw new AppError(404, "subscription_not_found");
    }

    const updated = await this.subscriptionsRepository.updateSubscription(subscription.subscription.id, {
      scheduledPlanId: planId,
    });

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
        subscriptionId: subscription.subscription.id,
      },
    });

    return updated;
  }

  async renewDueSubscriptions(now: Date) {
    const due = await this.subscriptionsRepository.listDueSubscriptions(now);
    for (const subscription of due) {
      const periodStart = subscription.currentPeriodStart;
      const periodEnd = subscription.currentPeriodEnd;

      if (!periodStart || !periodEnd) {
        continue;
      }

      const confirmed = await this.billingRepository.findSubscriptionTransaction({
        subscriptionId: subscription.id,
        type: "subscription_renewal",
        periodStart,
        periodEnd,
        status: "confirmed",
      });
      if (confirmed) {
        await this.advanceSubscription(subscription.id, subscription, now);
        continue;
      }

      const failed = await this.billingRepository.findSubscriptionTransaction({
        subscriptionId: subscription.id,
        type: "subscription_failed",
        periodStart,
        periodEnd,
      });
      if (failed) {
        continue;
      }

      const plan = await this.productsRepository.findPlanById(subscription.planId);
      if (!plan || !plan.isActive) {
        await this.subscriptionsRepository.updateSubscription(subscription.id, {
          status: "past_due",
          graceUntil: this.addDays(now, GRACE_DAYS),
        });
        continue;
      }

      const paymentMethod = await this.subscriptionsRepository.getActivePaymentMethod(
        subscription.companyId,
        ENV.PAYMENT_PROVIDER
      );

      if (paymentMethod) {
        const idempotencyKey = [
          subscription.id,
          periodStart.toISOString(),
          periodEnd.toISOString(),
          "card",
        ].join(":");

        const result = await this.gateway.createCharge({
          companyId: subscription.companyId,
          amountCents: plan.monthlyPriceCents,
          customerId: paymentMethod.customerId,
          paymentMethodId: paymentMethod.paymentMethodId,
          idempotencyKey,
          description: `Assinatura ${plan.name}`,
          metadata: {
            subscriptionId: subscription.id,
            periodStart: periodStart.toISOString(),
            periodEnd: periodEnd.toISOString(),
            planId: subscription.planId,
          },
        });

        if (result.status === "paid") {
          await this.billingRepository.createSubscriptionTransaction({
            subscriptionId: subscription.id,
            companyId: subscription.companyId,
            type: "subscription_renewal",
            status: "confirmed",
            amountCents: plan.monthlyPriceCents,
            provider: paymentMethod.provider,
            externalId: result.externalId,
            periodStart,
            periodEnd,
            metadata: {
              planId: subscription.planId,
              paymentMethodId: paymentMethod.paymentMethodId,
            },
          });

          await this.advanceSubscription(subscription.id, subscription, now, {
            paymentMethod: "card",
          });

          await this.notificationsService?.notifyEvent({
            companyId: subscription.companyId,
            category: "subscription",
            severity: "low",
            kind: "event",
            title: "Plano renovado",
            message: "Renovacao confirmada com sucesso.",
            ctaLabel: "Ver assinatura",
            ctaUrl: "/configuracoes",
            metadata: {
              subscriptionId: subscription.id,
              periodEnd: subscription.currentPeriodEnd?.toISOString?.(),
            },
          });
        } else {
          await this.billingRepository.createSubscriptionTransaction({
            subscriptionId: subscription.id,
            companyId: subscription.companyId,
            type: "subscription_failed",
            status: "failed",
            amountCents: plan.monthlyPriceCents,
            provider: paymentMethod.provider,
            externalId: result.externalId,
            periodStart,
            periodEnd,
            metadata: {
              planId: subscription.planId,
              paymentMethodId: paymentMethod.paymentMethodId,
            },
          });

          await this.subscriptionsRepository.updateSubscription(subscription.id, {
            status: "past_due",
            graceUntil: this.addDays(now, GRACE_DAYS),
            paymentMethod: "card",
          });

          await this.notificationsService?.notifyEvent({
            companyId: subscription.companyId,
            category: "subscription",
            severity: "high",
            kind: "alert",
            title: "Renovacao falhou",
            message: "Plano em past_due. Regularize para evitar cancelamento.",
            dedupeKey: "subscription_past_due",
            bucketDate: now.toISOString().slice(0, 10),
            ctaLabel: "Ver assinatura",
            ctaUrl: "/configuracoes",
            metadata: {
              subscriptionId: subscription.id,
              periodEnd: subscription.currentPeriodEnd?.toISOString?.(),
            },
          });
        }
      } else {
        const charge = await this.billingRepository.chargeSubscriptionWithWallet({
          subscriptionId: subscription.id,
          companyId: subscription.companyId,
          amountCents: plan.monthlyPriceCents,
          periodStart,
          periodEnd,
          metadata: {
            planId: subscription.planId,
          },
        });

        if (charge.status === "confirmed") {
          await this.advanceSubscription(subscription.id, subscription, now, {
            paymentMethod: "wallet",
          });

          await this.notificationsService?.notifyEvent({
            companyId: subscription.companyId,
            category: "subscription",
            severity: "low",
            kind: "event",
            title: "Plano renovado",
            message: "Renovacao confirmada com saldo.",
            ctaLabel: "Ver assinatura",
            ctaUrl: "/configuracoes",
            metadata: {
              subscriptionId: subscription.id,
              periodEnd: subscription.currentPeriodEnd?.toISOString?.(),
            },
          });
        } else {
          await this.subscriptionsRepository.updateSubscription(subscription.id, {
            status: "past_due",
            graceUntil: this.addDays(now, GRACE_DAYS),
            paymentMethod: "wallet",
          });

          await this.notificationsService?.notifyEvent({
            companyId: subscription.companyId,
            category: "subscription",
            severity: "high",
            kind: "alert",
            title: "Renovacao falhou",
            message: "Plano em past_due. Regularize para evitar cancelamento.",
            dedupeKey: "subscription_past_due",
            bucketDate: now.toISOString().slice(0, 10),
            ctaLabel: "Ver assinatura",
            ctaUrl: "/configuracoes",
            metadata: {
              subscriptionId: subscription.id,
              periodEnd: subscription.currentPeriodEnd?.toISOString?.(),
            },
          });
        }
      }
    }
  }

  async cancelExpiredGrace(now: Date) {
    const due = await this.subscriptionsRepository.listPastDueWithGraceExpired(now);
    for (const subscription of due) {
      await this.subscriptionsRepository.updateSubscription(subscription.id, {
        status: "cancelled",
      });

      await this.notificationsService?.notifyEvent({
        companyId: subscription.companyId,
        category: "subscription",
        severity: "high",
        kind: "alert",
        title: "Plano cancelado",
        message: "Cancelado por inadimplencia.",
        dedupeKey: "subscription_cancelled",
        bucketDate: now.toISOString().slice(0, 10),
        ctaLabel: "Ver assinatura",
        ctaUrl: "/configuracoes",
        metadata: {
          subscriptionId: subscription.id,
        },
      });
    }
  }

  private async advanceSubscription(
    subscriptionId: string,
    subscription: {
      planId: string;
      currentPeriodStart: Date;
      currentPeriodEnd: Date;
      scheduledPlanId: string | null;
    },
    now: Date,
    extra?: { paymentMethod?: "card" | "wallet" }
  ) {
    const nextStart = subscription.currentPeriodEnd;
    const nextEnd = this.addMonthsPreserveDay(nextStart, 1);

    const nextPlanId = subscription.scheduledPlanId ?? subscription.planId;

    await this.subscriptionsRepository.updateSubscription(subscriptionId, {
      planId: nextPlanId,
      currentPeriodStart: nextStart,
      currentPeriodEnd: nextEnd,
      scheduledPlanId: subscription.scheduledPlanId ? null : undefined,
      status: "active",
      graceUntil: null,
      paymentMethod: extra?.paymentMethod,
      updatedAt: now,
    });
  }

  private addMonthsPreserveDay(date: Date, months: number) {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const day = date.getUTCDate();
    const targetMonth = month + months;
    const lastDay = new Date(Date.UTC(year, targetMonth + 1, 0)).getUTCDate();
    const nextDay = Math.min(day, lastDay);
    return new Date(Date.UTC(year, targetMonth, nextDay, 0, 0, 0));
  }

  private addDays(date: Date, days: number) {
    const result = new Date(date.getTime());
    result.setUTCDate(result.getUTCDate() + days);
    return result;
  }
}
