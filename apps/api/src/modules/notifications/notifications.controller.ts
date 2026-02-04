import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { AppError } from "../../core/errors";
import { NotificationsService } from "./notifications.service";

const categoryEnum = z.enum([
  "financial",
  "visibility",
  "subscription",
  "contacts",
  "system",
]);

const severityEnum = z.enum(["low", "medium", "high"]);
const kindEnum = z.enum(["event", "summary", "alert"]);
const frequencyEnum = z.enum(["real_time", "daily", "weekly", "never"]);

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  category: categoryEnum.optional(),
  severity: severityEnum.optional(),
  kind: kindEnum.optional(),
  unread: z.coerce.boolean().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

const markReadSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
});

const preferencesUpdateSchema = z.object({
  panelEnabled: z.boolean().optional(),
  financialEnabled: z.boolean().optional(),
  visibilityEnabled: z.boolean().optional(),
  subscriptionEnabled: z.boolean().optional(),
  contactsEnabled: z.boolean().optional(),
  systemEnabled: z.boolean().optional(),
  frequency: frequencyEnum.optional(),
  whatsappEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
});

export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  async list(request: FastifyRequest, reply: FastifyReply) {
    const companyId = request.user?.companyId;
    if (!companyId) {
      throw new AppError(400, "company_required");
    }

    const parsed = listQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      throw new AppError(400, "invalid_query");
    }

    const result = await this.notificationsService.listNotifications(companyId, {
      category: parsed.data.category,
      severity: parsed.data.severity,
      kind: parsed.data.kind,
      unreadOnly: parsed.data.unread,
      from: parsed.data.from,
      to: parsed.data.to,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
    });

    return reply.send(result);
  }

  async markRead(request: FastifyRequest, reply: FastifyReply) {
    const companyId = request.user?.companyId;
    if (!companyId) {
      throw new AppError(400, "company_required");
    }

    const parsed = markReadSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw new AppError(400, "invalid_payload");
    }

    const updated = await this.notificationsService.markRead(companyId, parsed.data.ids);
    return reply.send({ updated });
  }

  async getPreferences(request: FastifyRequest, reply: FastifyReply) {
    const companyId = request.user?.companyId;
    if (!companyId) {
      throw new AppError(400, "company_required");
    }

    const preferences = await this.notificationsService.getPreferences(companyId);
    return reply.send(preferences);
  }

  async updatePreferences(request: FastifyRequest, reply: FastifyReply) {
    const companyId = request.user?.companyId;
    if (!companyId) {
      throw new AppError(400, "company_required");
    }

    const parsed = preferencesUpdateSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw new AppError(400, "invalid_payload");
    }

    const preferences = await this.notificationsService.updatePreferences(
      companyId,
      parsed.data
    );
    return reply.send(preferences);
  }
}
