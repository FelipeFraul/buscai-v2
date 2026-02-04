import { z } from "zod";

import { AppError } from "../../core/errors";
import { CompaniesRepository } from "../companies/companies.repository";

import {
  ContactRepository,
  type ContactChannel,
  type ContactClassification,
  type ContactFilters,
  type ContactEventRecord,
} from "./contact.repository";

const ClassificationSchema = z
  .union([z.literal("null"), z.literal(null), z.string()])
  .optional()
  .transform((value) => {
    if (value === undefined) return undefined;
    return value === null || value === "null" ? null : value;
  });

export class ContactService {
  constructor(
    private readonly contactRepository: ContactRepository,
    private readonly companiesRepository: CompaniesRepository
  ) {}

  async recordContact(params: {
    companyId: string;
    channel: ContactChannel;
    phone: string;
    name?: string | null;
    nicheId?: string | null;
    classification?: ContactClassification | null;
    createdAt?: Date;
  }): Promise<ContactEventRecord> {
    return this.contactRepository.createEvent(params);
  }

  async listContacts(
    actor: { userId: string; role: "admin" | "company_owner" },
    companyId: string,
    filters: ContactFilters
  ) {
    await this.ensureAccess(actor, companyId);

    const classification = ClassificationSchema.parse(filters.classification);

    return this.contactRepository.listByCompany(companyId, {
      ...filters,
      classification: (classification ?? undefined) as ContactFilters["classification"],
    });
  }

  async updateClassification(
    actor: { userId: string; role: "admin" | "company_owner" },
    params: { companyId: string; contactId: string; classification: ContactClassification | null }
  ): Promise<ContactEventRecord> {
    await this.ensureAccess(actor, params.companyId);

    const updated = await this.contactRepository.updateClassification({
      companyId: params.companyId,
      contactId: params.contactId,
      classification: params.classification,
    });

    if (!updated) {
      throw new AppError(404, "contact_not_found");
    }

    return updated;
  }

  private async ensureAccess(
    actor: { userId: string; role: "admin" | "company_owner" },
    companyId: string
  ): Promise<void> {
    if (actor.role === "admin") {
      return;
    }

    const company = await this.companiesRepository.getCompanyByIdForOwner(
      companyId,
      actor.userId
    );

    if (!company) {
      throw new AppError(403, "Forbidden");
    }
  }
}
