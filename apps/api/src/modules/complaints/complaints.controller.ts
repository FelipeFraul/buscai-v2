import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { AppError } from "../../core/errors";
import { ComplaintsService } from "./complaints.service";
import {
  complaintChannelEnum,
  complaintReasonEnum,
} from "./complaints.schema";

const ComplaintBodySchema = z
  .object({
    companyId: z.string().uuid().optional(),
    resultId: z.string().uuid().optional(),
    searchId: z.string().uuid().optional(),
    reason: z.enum(complaintReasonEnum.enumValues),
    comment: z.string().max(500).optional(),
    channel: z.enum(complaintChannelEnum.enumValues),
    customerContact: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.companyId && !value.resultId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["companyId"],
        message: "companyId_or_resultId_required",
      });
    }
  });

export class ComplaintsController {
  constructor(private readonly complaintsService: ComplaintsService) {}

  async register(request: FastifyRequest, reply: FastifyReply) {
    const parsed = ComplaintBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ message: "invalid_payload" });
    }

    try {
      const complaint = await this.complaintsService.registerComplaint(parsed.data);
      return reply.status(201).send({ id: complaint.id });
    } catch (error) {
      if (error instanceof AppError) {
        return reply.status(error.statusCode).send({ message: error.message });
      }
      throw error;
    }
  }
}
