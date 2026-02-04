import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { AppError } from "../../core/errors";

import { SubscriptionsService } from "./subscriptions.service";
import { SubscriptionsRepository } from "./subscriptions.repository";
import { NotificationsService } from "../notifications/notifications.service";

const SubscriptionQuerySchema = z.object({
  companyId: z.string().uuid().optional(),
});

const DowngradeBodySchema = z.object({
  planId: z.string().uuid(),
});

const PaymentMethodBodySchema = z.object({
  provider: z.enum(["stripe", "pagarme", "mercadopago", "dummy"]),
  customerId: z.string().min(1),
  paymentMethodId: z.string().min(1),
  brand: z.string().optional(),
  last4: z.string().optional(),
  expMonth: z.number().int().optional(),
  expYear: z.number().int().optional(),
});

const PaymentMethodParamsSchema = z.object({
  companyId: z.string().uuid(),
  id: z.string().uuid(),
});

export class SubscriptionsController {
  constructor(
    private readonly subscriptionsService: SubscriptionsService,
    private readonly subscriptionsRepository: SubscriptionsRepository,
    private readonly notificationsService?: NotificationsService
  ) {}

  async getSubscription(request: FastifyRequest, reply: FastifyReply) {
    const actor = request.user;
    if (!actor) {
      return reply.status(401).send();
    }

    const query = SubscriptionQuerySchema.parse(request.query ?? {});
    const companyId =
      actor.role === "admin" ? query.companyId : actor.companyId;

    if (!companyId) {
      throw new AppError(400, "company_id_required");
    }

    const subscription = await this.subscriptionsService.getSubscription(companyId);
    if (!subscription) {
      return reply.status(404).send();
    }

    return reply.send(subscription);
  }

  async scheduleDowngrade(request: FastifyRequest, reply: FastifyReply) {
    const params = z.object({ companyId: z.string().uuid() }).parse(request.params ?? {});
    const body = DowngradeBodySchema.parse(request.body ?? {});

    const updated = await this.subscriptionsService.scheduleDowngrade(
      params.companyId,
      body.planId
    );
    if (!updated) {
      throw new AppError(404, "subscription_not_found");
    }

    return reply.send(updated);
  }

  async registerPaymentMethod(request: FastifyRequest, reply: FastifyReply) {
    const params = z.object({ companyId: z.string().uuid() }).parse(request.params ?? {});
    const body = PaymentMethodBodySchema.parse(request.body ?? {});

    const created = await this.subscriptionsRepository.createPaymentMethod({
      companyId: params.companyId,
      provider: body.provider,
      customerId: body.customerId,
      paymentMethodId: body.paymentMethodId,
      status: "active",
      brand: body.brand ?? null,
      last4: body.last4 ?? null,
      expMonth: body.expMonth ?? null,
      expYear: body.expYear ?? null,
    });

    await this.notificationsService?.notifyEvent({
      companyId: params.companyId,
      category: "subscription",
      severity: "low",
      kind: "event",
      title: "Metodo de pagamento atualizado",
      message: "Seu metodo de pagamento foi atualizado.",
      ctaLabel: "Ver assinatura",
      ctaUrl: "/configuracoes",
      metadata: {
        paymentMethodId: created.id,
        provider: created.provider,
        last4: created.last4,
      },
    });

    return reply.status(201).send(created);
  }

  async revokePaymentMethod(request: FastifyRequest, reply: FastifyReply) {
    const params = PaymentMethodParamsSchema.parse(request.params ?? {});
    const updated = await this.subscriptionsRepository.revokePaymentMethod(
      params.companyId,
      params.id
    );
    if (!updated) {
      throw new AppError(404, "payment_method_not_found");
    }
    return reply.send(updated);
  }
}
