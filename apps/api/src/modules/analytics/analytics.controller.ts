import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { AppError } from "../../core/errors";

import { AnalyticsService } from "./analytics.service";
import { CompaniesRepository } from "../companies/companies.repository";

const DashboardQuerySchema = z.object({
  companyId: z.string().uuid().optional(),
  nicheId: z.string().uuid().optional(),
  cityId: z.string().uuid().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  period: z.string().optional(),
});

export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly companiesRepository: CompaniesRepository
  ) {}

  async getDashboard(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user;
    if (!user) {
      throw new AppError(401, "Unauthorized");
    }

    const query = DashboardQuerySchema.parse(request.query ?? {});

    let companyId =
      user.role === "admin"
        ? query.companyId
        : user.companyId;

    if (user.role === "company_owner" && query.companyId && query.companyId !== user.companyId) {
      const owned = await this.companiesRepository.getCompanyByIdForOwner(
        query.companyId,
        user.id
      );
      if (!owned) {
        throw new AppError(403, "company_not_linked");
      }
      companyId = query.companyId;
    }

    if (!companyId) {
      throw new AppError(400, "company_id_required");
    }

    const dashboard = await this.analyticsService.getDashboard({
      companyId,
      from: query.from,
      to: query.to,
      period: query.period,
      nicheId: query.nicheId,
      cityId: query.cityId,
      isAdmin: user.role === "admin",
    });
    return reply.send(dashboard);
  }
}
