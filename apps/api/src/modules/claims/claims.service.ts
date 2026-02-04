import { AppError } from "../../core/errors";
import { CompaniesRepository } from "../companies/companies.repository";
import { ClaimsRepository, CandidateResult } from "./claims.repository";
import { ENV } from "../../config/env";
import { ClaimMethod } from "./claims.schema";

const normalizePhone = (value: string | null | undefined): string | null => {
  if (!value) {
    return null;
  }
  const digits = value.replace(/\D/g, "");
  return digits || null;
};

const buildNext = (method: ClaimMethod) => {
  if (method === "whatsapp_otp") {
    return {
      type: "otp" as const,
      message: "Vamos confirmar que este WhatsApp é seu. Enviaremos um código.",
    };
  }

  return {
    type: "cnpj_whatsapp" as const,
    message:
      "Seu telefone é diferente do cadastro. Envie seu cartão CNPJ no WhatsApp abaixo para validar.",
    supportWhatsapp: ENV.CLAIM_SUPPORT_WHATSAPP,
  };
};

export class ClaimsService {
  private readonly claimsRepository = new ClaimsRepository();
  private readonly companiesRepository = new CompaniesRepository();

  async listCandidates(userId: string, cityId: string, q?: string): Promise<CandidateResult[]> {
    if (!cityId) {
      throw new AppError(400, "city_id_required");
    }

    return this.claimsRepository.findCandidates({ cityId, q });
  }

  async requestClaim(userId: string, payload: { companyId: string; phone: string }) {
    if (!payload.companyId) {
      throw new AppError(400, "company_id_required");
    }

    if (!payload.phone) {
      throw new AppError(400, "phone_required");
    }

    const company = await this.companiesRepository.findCompanyWithNiches(payload.companyId);
    if (!company) {
      throw new AppError(404, "company_not_found");
    }

    const serpPhone = normalizePhone(company.company.whatsapp ?? company.company.phone);
    const requestedPhone = normalizePhone(payload.phone);
    const method: ClaimMethod =
      requestedPhone && serpPhone && requestedPhone === serpPhone ? "whatsapp_otp" : "cnpj_whatsapp";

    const existing = await this.claimsRepository.findPendingRequest(
      payload.companyId,
      userId
    );

    if (existing) {
      return {
        requestId: existing.id,
        method: existing.method,
        next: buildNext(existing.method),
      };
    }

    const created = await this.claimsRepository.createRequest({
      companyId: payload.companyId,
      userId,
      method,
      requestedPhone: requestedPhone ?? null,
      serpPhone: serpPhone ?? null,
    });

    return {
      requestId: created.id,
      method,
      next: buildNext(method),
    };
  }

  async confirmCnpj(userId: string, requestId: string, message?: string) {
    if (!requestId) {
      throw new AppError(400, "request_id_required");
    }

    const record = await this.claimsRepository.getRequestById(requestId);
    if (!record) {
      throw new AppError(404, "request_not_found");
    }

    if (record.userId !== userId) {
      throw new AppError(403, "forbidden");
    }

    if (record.method !== "cnpj_whatsapp") {
      throw new AppError(400, "method_mismatch");
    }

    if (record.status !== "pending") {
      throw new AppError(400, "invalid_status");
    }

    const notes = [
      "Enviado cartão CNPJ via WhatsApp",
      message ? `Mensagem do usuário: ${message}` : undefined,
    ]
      .filter(Boolean)
      .join(" | ");

    await this.claimsRepository.updateNotes(requestId, notes);

    return {
      success: true,
      next: {
        type: "cnpj_whatsapp" as const,
        supportWhatsapp: ENV.CLAIM_SUPPORT_WHATSAPP,
        message:
          "Envie o cartão CNPJ para o número fornecido e aguarde nossa confirmação.",
      },
    };
  }
}
