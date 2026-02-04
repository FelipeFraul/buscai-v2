import {
  BillingRechargeIntentInputSchema,
  BillingTransactionsQuerySchema,
  CompanyIdParamSchema,
} from "@buscai/shared-schema";
import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { AppError } from "../../core/errors";
import { assertWritable } from "../../core/readonly";
import { incrementCounter } from "../../core/metrics";
import { BillingService } from "./billing.service";
import { CompaniesRepository } from "../companies/companies.repository";

export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly companiesRepository: CompaniesRepository
  ) {}

  async getWallet(request: FastifyRequest, reply: FastifyReply) {
    const { actor, companyId } = await this.resolveBillingContext(request);
    const wallet = await this.billingService.getWallet(actor, companyId);
    return reply.send(wallet);
  }

  async listTransactions(request: FastifyRequest, reply: FastifyReply) {
    const { actor, companyId } = await this.resolveBillingContext(request);
    const query = BillingTransactionsQuerySchema.parse(request.query ?? {});
    const transactions = await this.billingService.listTransactions(actor, {
      ...query,
      companyId,
    });
    return reply.send(transactions);
  }

  async createRechargeIntent(request: FastifyRequest, reply: FastifyReply) {
    assertWritable();
    const { actor, companyId } = await this.resolveBillingContext(request);
    const payload = BillingRechargeIntentInputSchema.parse(request.body ?? {});
    const intent = await this.billingService.createRechargeIntent(actor, {
      ...payload,
      companyId,
    });
    incrementCounter("billing_purchase_total");
    return reply.status(201).send(intent);
  }

  async confirmRecharge(request: FastifyRequest, reply: FastifyReply) {
    assertWritable();
    const userId = request.user?.id;
    if (!userId) {
      throw new AppError(401, "Unauthorized");
    }

    const actor = { userId, role: request.user?.role ?? "company_owner" };
    const rechargeId = (request.params as { rechargeId?: string })?.rechargeId;
    if (!rechargeId) {
      throw new AppError(400, "recharge_id_required");
    }

    const result = await this.billingService.confirmRecharge(actor, { rechargeId });
    return reply.send({
      rechargeId: result.rechargeId,
      status: result.status,
      amount: result.amount,
      newBalance: result.newBalance,
    });
  }

  async purchase(request: FastifyRequest, reply: FastifyReply) {
    assertWritable();
    const userId = request.user?.id;
    if (!userId) {
      throw new AppError(401, "Unauthorized");
    }

    const payloadSchema = z.object({
      amountCents: z.number().int().positive().optional(),
      description: z.string().optional(),
      companyId: z.string().uuid().optional(),
      plano: z.string().optional(),
    });

    const payload = payloadSchema.parse(request.body ?? {});
    const role = request.user?.role ?? "company_owner";
    let companyId: string | undefined;

    if (role === "admin") {
      const query = CompanyIdParamSchema.partial().safeParse(request.query ?? {});
      companyId = payload.companyId ?? (query.success ? query.data.companyId : undefined);
      if (!companyId) {
        throw new AppError(400, "company_id_required");
      }
    } else {
      const requestedCompanyId = payload.companyId;
      if (requestedCompanyId && requestedCompanyId !== request.user?.companyId) {
        const owned = await this.companiesRepository.getCompanyByIdForOwner(
          requestedCompanyId,
          userId
        );
        if (!owned) {
          throw new AppError(403, "company_not_linked");
        }
        companyId = requestedCompanyId;
      } else {
        companyId = request.user?.companyId ?? requestedCompanyId;
      }
      if (!companyId) {
        throw new AppError(403, "company_not_linked");
      }
    }

    let amountCents = payload.amountCents;
    if (!amountCents && payload.plano) {
      const parsed = Number(payload.plano);
      if (Number.isFinite(parsed) && parsed > 0) {
        amountCents = Math.round(parsed * 100);
      }
    }

    if (!amountCents) {
      throw new AppError(400, "amount_cents_required");
    }

    const result = await this.billingService.purchaseCredits(
      { userId, role },
      companyId,
      {
        amountCents,
        description: payload.description,
      }
    );

    return reply.send(result);
  }

  private async resolveBillingContext(
    request: FastifyRequest
  ): Promise<{
    actor: { userId: string; role: "admin" | "company_owner" };
    companyId: string;
  }> {
    const userId = request.user?.id;
    if (!userId) {
      throw new AppError(401, "Unauthorized");
    }

    const role = request.user?.role ?? "company_owner";

    if (role === "admin") {
      const parsed = CompanyIdParamSchema.safeParse(request.query ?? {});
      const companyId = parsed.success ? parsed.data.companyId : undefined;
      if (!companyId) {
        throw new AppError(400, "company_id_required");
      }
      return { actor: { userId, role }, companyId };
    }

    const parsed = CompanyIdParamSchema.partial().safeParse(request.query ?? {});
    const requestedCompanyId = parsed.success ? parsed.data.companyId : undefined;

    if (requestedCompanyId && requestedCompanyId !== request.user?.companyId) {
      const owned = await this.companiesRepository.getCompanyByIdForOwner(
        requestedCompanyId,
        userId
      );
      if (!owned) {
        throw new AppError(403, "company_not_linked");
      }
      return { actor: { userId, role }, companyId: requestedCompanyId };
    }

    const companyId = request.user?.companyId ?? requestedCompanyId;
    if (!companyId) {
      throw new AppError(403, "company_not_linked");
    }

    return { actor: { userId, role }, companyId };
  }
}
