import { CompanyIdParamSchema } from "@buscai/shared-schema";
import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { ContactService } from "./contact.service";
import { contactChannelEnum, contactClassificationEnum } from "./contact.schema";

const ClassificationValueSchema = z
  .string()
  .transform((value) => value.toLowerCase())
  .pipe(z.enum(contactClassificationEnum.enumValues));

const ContactQuerySchema = z.object({
  channel: z.enum(contactChannelEnum.enumValues).optional(),
  classification: z
    .union([ClassificationValueSchema, z.literal("null"), z.null()])
    .optional()
    .transform((value) => (value === undefined ? undefined : value)),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  page: z.coerce.number().optional(),
  pageSize: z.coerce.number().optional(),
});

const UpdateClassificationBodySchema = z.object({
  classification: z
    .union([ClassificationValueSchema, z.null()])
    .optional(),
});

export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  async list(request: FastifyRequest, reply: FastifyReply) {
    const actor = request.user;
    if (!actor) {
      return reply.status(401).send();
    }

    const params = CompanyIdParamSchema.parse(request.params ?? {});
    const query = ContactQuerySchema.parse(request.query ?? {});

    const result = await this.contactService.listContacts(
      { userId: actor.id, role: actor.role },
      params.companyId,
      query
    );

    return reply.send({
      items: result.items,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    });
  }

  async updateClassification(request: FastifyRequest, reply: FastifyReply) {
    const actor = request.user;
    if (!actor) {
      return reply.status(401).send();
    }

    const params = CompanyIdParamSchema.extend({
      contactId: z.string(),
    }).parse(request.params ?? {});

    const body = UpdateClassificationBodySchema.parse(request.body ?? {});

    const updated = await this.contactService.updateClassification(
      { userId: actor.id, role: actor.role },
      {
        companyId: params.companyId,
        contactId: params.contactId,
        classification:
          body.classification === undefined ? null : body.classification,
      }
    );

    return reply.send(updated);
  }
}
