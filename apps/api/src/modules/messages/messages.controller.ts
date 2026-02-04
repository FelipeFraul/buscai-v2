import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";

import { AppError } from "../../core/errors";
import { MessagesService } from "./messages.service";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  peerE164: z.string().min(3).optional(),
  direction: z.enum(["inbound", "outbound"]).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  async listHistory(request: FastifyRequest, reply: FastifyReply) {
    const companyId = request.user?.companyId;
    if (!companyId) {
      throw new AppError("company_required", "Company is required.", 400);
    }

    const parsed = querySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      throw new AppError("INVALID_PAYLOAD", "Parâmetros inválidos", 400, parsed.error.issues);
    }

    const { items, nextOffset } = await this.messagesService.listHistory({
      companyId,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
      peerE164: parsed.data.peerE164,
      direction: parsed.data.direction,
      from: parsed.data.from,
      to: parsed.data.to,
    });

    return reply.send({ items, nextOffset });
  }
}
