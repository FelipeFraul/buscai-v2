import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { ClaimsService } from "./claims.service";
import { AppError } from "../../core/errors";

const candidateQuerySchema = z.object({
  cityId: z.string().uuid(),
  q: z.string().optional(),
});

const claimRequestSchema = z.object({
  companyId: z.string().uuid(),
  phone: z.string().min(1),
});

const cnpjConfirmSchema = z.object({
  requestId: z.string().uuid(),
  message: z.string().optional(),
});

const maskPhone = (value?: string | null) => {
  if (!value) {
    return null;
  }
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 4) {
    return digits;
  }
  const masked = "*".repeat(digits.length - 4) + digits.slice(-4);
  return masked;
};

export class ClaimsController {
  constructor(private readonly claimsService = new ClaimsService()) {}

  async listCandidates(request: FastifyRequest, reply: FastifyReply) {
    const query = candidateQuerySchema.parse(request.query ?? {});
    const userId = request.user?.id;
    if (!userId) {
      throw new AppError(401, "Unauthorized");
    }

    const candidates = await this.claimsService.listCandidates(userId, query.cityId, query.q);
    const payload = candidates.map((candidate) => ({
      companyId: candidate.companyId,
      nome: candidate.nome,
      cityId: candidate.cityId,
      serpPhoneMasked: maskPhone(candidate.serpPhone ?? undefined) ?? "",
      matchReason: candidate.matchReason,
    }));
    return reply.send(payload);
  }

  async requestClaim(request: FastifyRequest, reply: FastifyReply) {
    const body = claimRequestSchema.parse(request.body ?? {});
    const userId = request.user?.id;
    if (!userId) {
      throw new AppError(401, "Unauthorized");
    }

    const result = await this.claimsService.requestClaim(userId, {
      companyId: body.companyId,
      phone: body.phone,
    });

    return reply.send({
      requestId: result.requestId,
      method: result.method,
      next: result.next,
    });
  }

  async confirmCnpj(request: FastifyRequest, reply: FastifyReply) {
    const body = cnpjConfirmSchema.parse(request.body ?? {});
    const userId = request.user?.id;
    if (!userId) {
      throw new AppError(401, "Unauthorized");
    }

    const result = await this.claimsService.confirmCnpj(userId, body.requestId, body.message);
    return reply.send(result);
  }
}
