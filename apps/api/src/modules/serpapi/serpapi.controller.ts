import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { AppError } from "../../core/errors";
import { ManualImportUnknownNichesError, SerpapiService } from "./serpapi.service";
import { SERPAPI_RECORD_STATUSES } from "./serpapi.schema";

const MANUAL_IMPORT_MAX_ROWS = 5000;
const MANUAL_IMPORT_MAX_FIELD_LENGTH = 500;

const manualRowValueSchema = z.union([
  z.string().max(MANUAL_IMPORT_MAX_FIELD_LENGTH),
  z.number(),
  z.boolean(),
  z.null(),
]);

const importSchema = z.object({
  cityId: z.string().uuid(),
  nicheId: z.string().uuid(),
  query: z.string().optional(),
  limit: z.coerce.number().optional(),
  dryRun: z.boolean().optional().default(false),
});

const importManualSchema = z.object({
  fixedCityId: z.string().uuid().nullable().optional(),
  fixedNicheId: z.string().uuid().nullable().optional(),
  mapping: z.object({
    name: z.string().optional(),
    phone: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    niche: z.string().optional(),
    source: z.string().optional(),
    instagram: z.string().optional(),
    site: z.string().optional(),
    url: z.string().optional(),
  }),
  rows: z.array(z.record(manualRowValueSchema)).min(1).max(MANUAL_IMPORT_MAX_ROWS),
  options: z
    .object({
      ignoreDuplicates: z.boolean().optional().default(false),
      updateExisting: z.boolean().optional().default(false),
      dryRun: z.boolean().optional().default(false),
    })
    .optional(),
});

const runsQuerySchema = z.object({
  page: z.coerce.number().optional().default(1),
  pageSize: z.coerce.number().optional().default(10),
  excludeTests: z.coerce.boolean().optional().default(false),
});

const runDetailSchema = z.object({
  status: z.string().optional(),
  page: z.coerce.number().optional().default(1),
  pageSize: z.coerce.number().optional().default(20),
});

const recordsQuerySchema = z.object({
  status: z.enum(SERPAPI_RECORD_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

const resolveConflictSchema = z.object({
  recordId: z.string().uuid(),
  action: z.enum(["link_existing", "create_new", "ignore"]),
  companyId: z.string().uuid().optional(),
});

const publishRecordSchema = z.object({
  statusAfter: z.enum(["pending", "active"]).optional(),
  force: z.boolean().optional().default(false),
  targetCompanyId: z.string().uuid().optional(),
});

const exportQuerySchema = z.object({
  runId: z.string().uuid(),
  type: z.enum(["runs", "records", "conflicts", "companies"]).default("runs"),
});

const exportFilteredSchema = z.object({
  periodDays: z.coerce.number().int().positive().optional(),
  cityId: z.string().uuid().optional(),
  nicheId: z.string().uuid().optional(),
});

const nichesQuerySchema = z.object({
  query: z.string().optional(),
});

const exportNichesQuerySchema = z.object({
  query: z.string().optional(),
});

const exportCompaniesQuerySchema = z.object({
  nicheId: z.string().uuid().optional(),
});

const publishRunSchema = z.object({
  force: z.boolean().optional().default(false),
});

const createNicheSchema = z.object({
  label: z.string().min(2),
});

const bulkNicheSchema = z.object({
  labels: z.array(z.string().min(2)).min(1),
});

const updateNicheSchema = z.object({
  label: z.string().min(2),
});

const serpapiApiKeySchema = z.object({
  apiKey: z.string().min(10),
  label: z.string().min(2).max(80).optional(),
});

const serpapiApiKeySelectSchema = z.object({
  apiKeyId: z.string().uuid(),
});

const serpapiApiKeyUpdateSchema = z.union([serpapiApiKeySchema, serpapiApiKeySelectSchema]);

export class SerpapiController {
  constructor(private readonly service = new SerpapiService()) {}

  async import(request: FastifyRequest, reply: FastifyReply) {
    let body;
    try {
      body = importSchema.parse(request.body ?? {});
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          error: {
            code: "INVALID_PAYLOAD",
            message: "Dados de importação inválidos",
            issues: error.issues,
          },
        });
      }
      throw error;
    }
    const userId = request.user?.id;
    if (!userId) {
      throw new AppError(401, "Unauthorized");
    }
    const result = await this.service.startImport(userId, body);
    return reply.send(result);
  }

  async importManual(request: FastifyRequest, reply: FastifyReply) {
    let body;
    try {
      body = importManualSchema.parse(request.body ?? {});
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          error: {
            code: "INVALID_PAYLOAD",
            message: "Dados de importacao invalidos",
            issues: error.issues,
          },
        });
      }
      throw error;
    }
    const userId = request.user?.id;
    if (!userId) {
      throw new AppError(401, "Unauthorized");
    }
    try {
      const normalizedBody = {
        ...body,
        fixedCityId: body.fixedCityId ?? undefined,
        fixedNicheId: body.fixedNicheId ?? undefined,
      };
      const result = await this.service.startManualImport(userId, normalizedBody);
      if (reply.sent) {
        return reply;
      }
      return reply.send(result);
    } catch (error) {
      if (error instanceof ManualImportUnknownNichesError) {
        if (reply.sent) {
          return reply;
        }
        return reply.status(400).send({
          message: error.message,
          unknownNiches: error.unknownNiches,
        });
      }
      throw error;
    }
  }

  async listRuns(request: FastifyRequest, reply: FastifyReply) {
    const query = runsQuerySchema.parse(request.query ?? {});
    const runs = await this.service.listRuns(query.page, query.pageSize, {
      excludeTests: query.excludeTests,
    });
    return reply.send(runs);
  }

  async getRun(request: FastifyRequest, reply: FastifyReply) {
    const params = z.object({ runId: z.string().uuid() }).parse(request.params ?? {});
    const query = runDetailSchema.parse(request.query ?? {});
    const detail = await this.service.getRunDetails(params.runId, {
      status: query.status,
      page: query.page,
      pageSize: query.pageSize,
    });
    if (!detail) {
      return reply.status(404).send({ message: "run_not_found" });
    }
    return reply.send(detail);
  }

  async listRecords(request: FastifyRequest, reply: FastifyReply) {
    const params = z.object({ runId: z.string().uuid() }).parse(request.params ?? {});
    let query;
    try {
      query = recordsQuerySchema.parse(request.query ?? {});
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          error: {
            code: "INVALID_PAYLOAD",
            message: "Parâmetros inválidos",
            issues: error.issues,
          },
        });
      }
      throw error;
    }
    const records = await this.service.listRecordsForRun(params.runId, {
      status: query.status,
      limit: query.limit,
      offset: query.offset,
    });
    if (!records) {
      return reply.status(404).send({ message: "run_not_found" });
    }
    return reply.send(records);
  }

  async resolveConflict(request: FastifyRequest, reply: FastifyReply) {
    const params = z.object({ runId: z.string().uuid() }).parse(request.params ?? {});
    const body = resolveConflictSchema.parse(request.body ?? {});
    const result = await this.service.resolveConflict(body);
    return reply.send(result);
  }

  async publishRecord(request: FastifyRequest, reply: FastifyReply) {
    const params = z
      .object({ runId: z.string().uuid(), recordId: z.string().uuid() })
      .parse(request.params ?? {});
    let body;
    try {
      body = publishRecordSchema.parse(request.body ?? {});
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          error: {
            code: "INVALID_PAYLOAD",
            message: "Parâmetros inválidos",
            issues: error.issues,
          },
        });
      }
      throw error;
    }

    const userId = request.user?.id;
    if (!userId) {
      throw new AppError(401, "Unauthorized");
    }

    const result = await this.service.publishRecord(userId, params.runId, params.recordId, body);
    if ("conflict" in result && result.conflict) {
      return reply.status(409).send({
        message: "dedupe_conflict",
        dedupeHits: result.dedupeHits,
      });
    }
    return reply.send(result);
  }

  async export(request: FastifyRequest, reply: FastifyReply) {
    const query = exportQuerySchema.parse(request.query ?? {});
    const rows = await this.service.exportData(query.runId, query.type);
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    reply.header("Content-Type", "text/csv");
    return reply.send(csv);
  }

  async exportFiltered(request: FastifyRequest, reply: FastifyReply) {
    const query = exportFilteredSchema.parse(request.query ?? {});
    const rows = await this.service.exportFilteredRecords(query);
    return reply.send(rows);
  }

  async listNiches(request: FastifyRequest, reply: FastifyReply) {
    const query = nichesQuerySchema.parse(request.query ?? {});
    const rows = await this.service.listNicheDistribution(query.query);
    return reply.send(rows);
  }

  async getApiKeyStatus(request: FastifyRequest, reply: FastifyReply) {
    const status = await this.service.getSerpapiApiKeyStatus();
    return reply.send(status);
  }

  async listApiKeys(request: FastifyRequest, reply: FastifyReply) {
    const keys = await this.service.listSerpapiApiKeys();
    return reply.send(keys);
  }

  async updateApiKey(request: FastifyRequest, reply: FastifyReply) {
    const body = serpapiApiKeyUpdateSchema.parse(request.body ?? {});
    const result =
      "apiKey" in body
        ? await this.service.updateSerpapiApiKey(body.apiKey, body.label)
        : await this.service.selectSerpapiApiKey(body.apiKeyId);
    return reply.send(result);
  }

  async getMetrics(request: FastifyRequest, reply: FastifyReply) {
    const metrics = await this.service.getAllTimeMetrics();
    return reply.send(metrics);
  }

  async createNiche(request: FastifyRequest, reply: FastifyReply) {
    const body = createNicheSchema.parse(request.body ?? {});
    const niche = await this.service.createNiche(body.label);
    return reply.send(niche);
  }

  async createNichesBulk(request: FastifyRequest, reply: FastifyReply) {
    const body = bulkNicheSchema.parse(request.body ?? {});
    const result = await this.service.createNichesBulk(body.labels);
    return reply.send(result);
  }

  async updateNiche(request: FastifyRequest, reply: FastifyReply) {
    const params = z.object({ nicheId: z.string().uuid() }).parse(request.params ?? {});
    const body = updateNicheSchema.parse(request.body ?? {});
    const niche = await this.service.updateNicheLabel(params.nicheId, body.label);
    return reply.send(niche);
  }

  async listNicheCompanies(request: FastifyRequest, reply: FastifyReply) {
    const params = z.object({ nicheId: z.string().uuid() }).parse(request.params ?? {});
    const result = await this.service.listNicheCompanies(params.nicheId);
    return reply.send(result);
  }

  async reprocessNiche(request: FastifyRequest, reply: FastifyReply) {
    const params = z.object({ nicheId: z.string().uuid() }).parse(request.params ?? {});
    const userId = request.user?.id;
    if (!userId) {
      throw new AppError(401, "Unauthorized");
    }
    const result = await this.service.reprocessNiche(userId, params.nicheId);
    return reply.send(result);
  }

  async deleteNicheCompanies(request: FastifyRequest, reply: FastifyReply) {
    const params = z.object({ nicheId: z.string().uuid() }).parse(request.params ?? {});
    const result = await this.service.deleteNiche(params.nicheId);
    return reply.send(result);
  }

  async deleteNicheCompany(request: FastifyRequest, reply: FastifyReply) {
    const params = z
      .object({ nicheId: z.string().uuid(), companyId: z.string().uuid() })
      .parse(request.params ?? {});
    const result = await this.service.deleteCompanyFromNiche(params.nicheId, params.companyId);
    return reply.send(result);
  }

  async exportNiches(request: FastifyRequest, reply: FastifyReply) {
    const query = exportNichesQuerySchema.parse(request.query ?? {});
    const rows = await this.service.listNicheDistribution(query.query);
    const csv = [
      ["nicheId", "nicheName", "companiesCount"],
      ...rows.map((row) => [row.nicheId, row.nicheName, row.companiesCount]),
    ]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    reply.header("Content-Type", "text/csv");
    reply.header("Content-Disposition", "attachment; filename=serpapi_niches.csv");
    return reply.send(csv);
  }

  async exportCompanies(request: FastifyRequest, reply: FastifyReply) {
    const query = exportCompaniesQuerySchema.parse(request.query ?? {});
    const rows = await this.service.exportCompanies(query.nicheId);
    const csv = [
      [
        "companyId",
        "tradeName",
        "address",
        "phone",
        "whatsapp",
        "city",
        "niche",
        "source",
        "createdAt",
      ],
      ...rows.map((row) => [
        row.companyId,
        row.tradeName,
        row.address,
        row.phone,
        row.whatsapp,
        row.city,
        row.niche,
        row.source,
        row.createdAt,
      ]),
    ]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    reply.header("Content-Type", "text/csv");
    reply.header("Content-Disposition", "attachment; filename=serpapi_companies.csv");
    return reply.send(csv);
  }

  async exportFull(request: FastifyRequest, reply: FastifyReply) {
    const rows = await this.service.exportFull();
    const csv = [
      [
        "Nicho",
        "Nome",
        "Endereço",
        "Telefone",
        "WhatsApp",
        "Origem",
        "Cidade",
      ],
      ...rows.map((row) => [
        row.niche,
        row.name,
        row.address,
        row.phone,
        row.whatsapp,
        row.source,
        row.city,
      ]),
    ]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    reply.header("Content-Type", "text/csv");
    reply.header("Content-Disposition", "attachment; filename=serpapi_full.csv");
    return reply.send(csv);
  }

  async publishRun(request: FastifyRequest, reply: FastifyReply) {
    const params = z.object({ runId: z.string().uuid() }).parse(request.params ?? {});
    const body = publishRunSchema.parse(request.body ?? {});
    const userId = request.user?.id;
    if (!userId) {
      throw new AppError(401, "Unauthorized");
    }
    const result = await this.service.publishManualRun(userId, params.runId, {
      force: body.force,
    });
    return reply.send(result);
  }

  async invalidate(request: FastifyRequest, reply: FastifyReply) {
    const params = z.object({ runId: z.string().uuid() }).parse(request.params ?? {});
    const result = await this.service.invalidateRun(params.runId);
    return reply.send(result);
  }
}
