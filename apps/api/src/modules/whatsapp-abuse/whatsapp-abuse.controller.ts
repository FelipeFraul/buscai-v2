import { z } from "zod";
import type { FastifyReply, FastifyRequest } from "fastify";

import { WhatsappAbuseService } from "./whatsapp-abuse.service";

const blockSchema = z.object({
  phone: z.string().min(6),
  durationHours: z.number().int().positive().optional(),
  reason: z.string().min(1).max(64).optional(),
  message: z.string().min(1).max(240).optional(),
});

const unblockSchema = z.object({
  phone: z.string().min(6),
});

export class WhatsappAbuseController {
  constructor(private readonly abuseService: WhatsappAbuseService) {}

  async listAlerts(_request: FastifyRequest, reply: FastifyReply) {
    const alerts = await this.abuseService.listAlerts();
    return reply.send(alerts);
  }

  async blockNumber(request: FastifyRequest, reply: FastifyReply) {
    const actor = request.user;
    if (!actor) {
      return reply.status(401).send();
    }
    const payload = blockSchema.parse(request.body ?? {});
    const durationHours = payload.durationHours ?? 24;
    await this.abuseService.upsertBlock({
      phone: payload.phone,
      reason: payload.reason ?? "manual",
      message: payload.message ?? "Seu numero esta bloqueado. Tente novamente mais tarde.",
      blockedUntil: new Date(Date.now() + durationHours * 60 * 60 * 1000),
      createdByUserId: actor.id,
    });
    return reply.send({ ok: true });
  }

  async unblockNumber(request: FastifyRequest, reply: FastifyReply) {
    const payload = unblockSchema.parse(request.params ?? {});
    await this.abuseService.unblock(payload.phone);
    return reply.send({ ok: true });
  }
}
