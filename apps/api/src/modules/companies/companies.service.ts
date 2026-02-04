import {
  CompaniesQuerySchema,
  CompanyChannelsInputSchema,
  CompanyClaimInputSchema,
  CompanyCreateInputSchema,
  CompanyUpdateInputSchema,
} from "@buscai/shared-schema";
import type { components } from "@buscai/shared-schema/src/api-types";
import { z } from "zod";

import { AppError } from "../../core/errors";
import type { AuctionRepository } from "../auction/auction.repository";
import type { BillingRepository } from "../billing/billing.repository";
import type { ProductsRepository } from "../products/products.repository";
import type { CompanyOverview } from "./company.overview";
import {
  CompaniesRepository,
  type CompanyEntity,
} from "./companies.repository";
import {
  normalizeAddressLine,
  normalizeName,
  normalizePhoneToE164BR,
  normalizeWebsite,
  toDigits,
} from "./companyNormalization";
import { findDedupeHits } from "./companyDedupe";
import { computeQualityScore } from "./companyQuality";

type CompaniesQuery = z.infer<typeof CompaniesQuerySchema>;
type CompanyCreateInput = z.infer<typeof CompanyCreateInputSchema>;
type CompanyUpdateInput = z.infer<typeof CompanyUpdateInputSchema>;
type CompanyClaimInput = z.infer<typeof CompanyClaimInputSchema>;
type CompanyChannelsInput = z.infer<typeof CompanyChannelsInputSchema>;

type CompanyDto = components["schemas"]["Company"];
type PaginatedCompanies = components["schemas"]["PaginatedCompanies"];
type CompetitiveSummary = {
  companyId: string;
  auction: {
    active: boolean;
    activeConfigs: number;
    activeDailyBudget: number;
    totalDailyBudget: number;
    highestBid: number;
  };
  products: {
    totalOffers: number;
    activeOffers: number;
    items: Array<{
      title: string;
      priceCents: number;
      isActive: boolean;
    }>;
  };
};
type CompanySearchResult = {
  id: string;
  tradeName: string;
  status?: string;
  city?: {
    id: string;
    name: string;
    state: string;
  };
};

type AdminCompanyPayload = {
  name: string;
  cityId: string;
  nicheId: string;
  addressLine: string;
  phoneE164?: string;
  whatsappE164?: string;
  website?: string;
  lat?: number;
  lng?: number;
  status?: "draft" | "pending" | "active" | "suspended";
  origin?: "serpapi" | "manual" | "claimed";
  qualityScore?: number;
  force?: boolean;
  participatesInAuction?: boolean;
  hasWhatsapp?: boolean;
};

type AdminCompaniesQuery = {
  cityId?: string;
  nicheId?: string;
  status?: "draft" | "pending" | "active" | "suspended";
  q?: string;
  page: number;
  limit: number;
};

const ACTIVE_MIN_SCORE = 70;

export class CompaniesService {
  constructor(
    private readonly companiesRepository: CompaniesRepository,
    private readonly billingRepository?: BillingRepository,
    private readonly productsRepository?: ProductsRepository,
    private readonly auctionRepository?: AuctionRepository
  ) {}

  async listCompanies(
    ownerId: string,
    _query: CompaniesQuery
  ): Promise<PaginatedCompanies> {
    await this.ensureOwnerExists(ownerId);

    const companies = await this.companiesRepository.listCompaniesByOwner(ownerId);

    const items = companies.map((entity) => this.mapToDto(entity));

    return {
      items,
      total: items.length,
      page: 1,
      pageSize: items.length,
    };
  }

  async createCompany(
    ownerId: string,
    payload: CompanyCreateInput
  ): Promise<CompanyDto> {
    await this.ensureOwnerExists(ownerId);

    const city = await this.companiesRepository.findCityById(payload.cityId);

    if (!city || !city.isActive) {
      throw new AppError(400, "Invalid city");
    }

    const nicheIds = payload.nicheIds ?? [];
    await this.ensureNichesExist(nicheIds);

    const channels = this.mapChannelsInput(payload.channels);
    const dedupeHits = await findDedupeHits({
      name: payload.tradeName,
      addressLine: channels?.address ?? null,
      phoneE164: channels?.phone ?? null,
      whatsappE164: channels?.whatsapp ?? null,
    });

    if (dedupeHits.length) {
      throw new AppError(409, "company_already_exists", "COMPANY_ALREADY_EXISTS");
    }

    const qualityScore = computeQualityScore({
      name: payload.tradeName,
      addressLine: channels?.address ?? null,
      cityId: payload.cityId,
      nicheId: nicheIds[0] ?? null,
      phoneE164: channels?.phone ?? null,
      whatsappE164: channels?.whatsapp ?? null,
    });

    const status = qualityScore >= ACTIVE_MIN_SCORE ? "active" : "pending";

    const entity = await this.companiesRepository.createCompanyForOwner({
      ownerId,
      tradeName: payload.tradeName,
      legalName: payload.legalName ?? null,
      cityId: payload.cityId,
      status,
      qualityScore,
      channels,
      nicheIds,
    });

    return this.mapToDto(entity);
  }

  async getCompanyById(ownerId: string, companyId: string): Promise<CompanyDto> {
    await this.ensureOwnerExists(ownerId);

    const entity = await this.companiesRepository.getCompanyByIdForOwner(
      companyId,
      ownerId
    );

    if (!entity) {
      throw new AppError(404, "Company not found");
    }

    return this.mapToDto(entity);
  }

  async updateCompany(
    ownerId: string,
    companyId: string,
    payload: CompanyUpdateInput
  ): Promise<CompanyDto> {
    await this.ensureOwnerExists(ownerId);

    if (payload.nicheIds) {
      await this.ensureNichesExist(payload.nicheIds);
    }

    const entity = await this.companiesRepository.updateCompanyForOwner(
      companyId,
      ownerId,
      {
        tradeName: payload.tradeName,
        legalName: payload.legalName,
        nicheIds: payload.nicheIds,
      }
    );

    if (!entity) {
      throw new AppError(404, "Company not found");
    }

    await this.refreshCompanyQuality(entity.company.id);

    return this.mapToDto(entity);
  }

  async claimCompany(
    _companyId: string,
    _payload: CompanyClaimInput
  ): Promise<{ status: string }> {
    return { status: "not_available" };
  }

  async updateCompanyChannels(
    companyId: string,
    payload: CompanyChannelsInput
  ): Promise<{ status: string }> {
    const updated = await this.companiesRepository.updateCompanyChannels(
      companyId,
      payload
    );

    if (!updated) {
      throw new AppError(404, "Company not found");
    }

    await this.refreshCompanyQuality(companyId);

    return { status: "updated" };
  }

  async getCompanyOverview(actor: {
    role: "company_owner" | "admin";
    companyId?: string;
    userId?: string;
  }): Promise<CompanyOverview> {
    if (actor.role === "company_owner") {
      if (!actor.userId) {
        throw new AppError(401, "Unauthorized");
      }
      const resolvedCompanyId =
        actor.companyId ??
        (await this.companiesRepository.getLatestCompanyByOwner(actor.userId))?.company.id;
      if (!resolvedCompanyId) {
        throw new AppError(404, "Company not found");
      }

      const entity = await this.companiesRepository.getCompanyByIdForOwner(
        resolvedCompanyId,
        actor.userId
      );
      if (!entity) {
        throw new AppError(404, "Company not found");
      }

      return this.buildCompanyOverview(entity);
    }

    const companyId = actor.companyId;
    if (!companyId) {
      throw new AppError(400, "company_id_required");
    }

    const entity = await this.companiesRepository.findCompanyWithNiches(companyId);
    if (!entity) {
      throw new AppError(404, "Company not found");
    }

    return this.buildCompanyOverview(entity);
  }

  private async buildCompanyOverview(entity: CompanyEntity): Promise<CompanyOverview> {
    const companyId = entity.company.id;
    const company = this.mapToDto(entity);

    const wallet = this.billingRepository
      ? await this.billingRepository.getWalletByCompanyId(companyId)
      : null;

    const billing = {
      wallet: {
        balanceCents: Number(wallet?.balance ?? 0),
        reservedCents: Number(wallet?.reserved ?? 0),
      },
    };

    const products = {
      activeOffers: this.productsRepository?.countActiveOffersForCompany
        ? await this.productsRepository.countActiveOffersForCompany(companyId)
        : 0,
    };

    const auction = {
      activeConfigs:
        this.auctionRepository && (this.auctionRepository as any).countConfigsByCompany
          ? await (this.auctionRepository as any).countConfigsByCompany(companyId)
          : 0,
    };

    return {
      company,
      billing,
      products,
      auction,
    };
  }

  async listCompanyNiches(actor: { userId: string; role: "company_owner" | "admin"; companyId?: string }, overrideCompanyId?: string) {
    const companyId =
      actor.role === "admin" ? overrideCompanyId ?? actor.companyId : actor.companyId;

    if (!companyId) {
      throw new AppError(actor.role === "admin" ? 400 : 403, "company_id_required");
    }

    const entity =
      actor.role === "admin"
        ? await this.companiesRepository.findCompanyWithNiches(companyId)
        : await this.companiesRepository.getCompanyByIdForOwner(companyId, actor.userId);

    if (!entity) {
      throw new AppError(404, "Company not found");
    }

    const niches = entity.niches.length
      ? entity.niches
      : await this.companiesRepository.listAllNiches();

    return niches.map((niche) => ({
      nicheId: niche.id,
      nome: niche.label,
      status: niche.isActive === false ? "inativo" : "ativo",
      buscas: 0,
      aparicoes: 0,
      cliques: 0,
      custo: 0,
      ctr: 0,
    }));
  }

  async getCompetitiveSummary(companyId: string): Promise<CompetitiveSummary> {
    const entity = await this.companiesRepository.findCompanyWithNiches(companyId);
    if (!entity) {
      throw new AppError(404, "Company not found");
    }

    const toNumber = (value: unknown) => {
      const parsed = typeof value === "number" ? value : Number(value ?? 0);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const auctionConfigs =
      this.auctionRepository?.listConfigs
        ? await this.auctionRepository.listConfigs({ companyId })
        : [];
    const activeAuctionConfigs = auctionConfigs.filter((config) => config.isActive);
    const activeDailyBudget = activeAuctionConfigs.reduce(
      (acc, config) => acc + toNumber(config.dailyBudget),
      0
    );
    const totalDailyBudget = auctionConfigs.reduce(
      (acc, config) => acc + toNumber(config.dailyBudget),
      0
    );
    const highestBid = auctionConfigs.reduce((acc, config) => {
      const bids = [
        toNumber(config.bidPosition1),
        toNumber(config.bidPosition2),
        toNumber(config.bidPosition3),
      ];
      return Math.max(acc, ...bids);
    }, 0);

    const offersPayload =
      this.productsRepository?.listProductOffersForCompany
        ? await this.productsRepository.listProductOffersForCompany(companyId, 1, 10)
        : { items: [], total: 0 };
    const activeOffers = offersPayload.items.filter((offer) => offer.isActive).length;
    const items = offersPayload.items.map((offer) => ({
      title: offer.title,
      priceCents: toNumber(offer.priceCents),
      isActive: Boolean(offer.isActive),
    }));

    return {
      companyId,
      auction: {
        active: activeAuctionConfigs.length > 0,
        activeConfigs: activeAuctionConfigs.length,
        activeDailyBudget,
        totalDailyBudget,
        highestBid,
      },
      products: {
        totalOffers: offersPayload.total,
        activeOffers,
        items,
      },
    };
  }

  async searchCompanies(params: {
    q: string;
    cityId?: string;
    excludeCompanyId?: string;
    limit?: number;
  }): Promise<CompanySearchResult[]> {
    const rows = await this.companiesRepository.searchCompaniesByName({
      query: params.q,
      cityId: params.cityId,
      excludeCompanyId: params.excludeCompanyId,
      limit: params.limit,
    });

    return rows.map((row) => ({
      id: row.company.id,
      tradeName: row.company.tradeName,
      status: row.company.status,
      city: row.city
        ? {
            id: row.city.id,
            name: row.city.name,
            state: row.city.state,
          }
        : undefined,
    }));
  }

  async listAdminCompanies(query: AdminCompaniesQuery) {
    const page = Math.max(query.page, 1);
    const limit = Math.min(Math.max(query.limit, 1), 100);
    const offset = (page - 1) * limit;

    const result = await this.companiesRepository.listAdminCompanies({
      cityId: query.cityId,
      nicheId: query.nicheId,
      status: query.status,
      q: query.q,
      limit,
      offset,
    });

    return {
      items: result.items.map((row) => ({
        id: row.id,
        name: row.tradeName,
        cityId: row.cityId,
        nicheId: row.nicheId,
        addressLine: row.address ?? "",
        phoneE164: row.phone ?? null,
        whatsappE164: row.whatsapp ?? null,
        website: row.website ?? null,
        lat: row.lat ?? null,
        lng: row.lng ?? null,
        status: row.status,
        participatesInAuction: row.participatesInAuction,
        hasWhatsapp: row.hasWhatsapp,
        origin: row.source,
        qualityScore: row.qualityScore,
        createdAt: row.createdAt?.toISOString(),
        updatedAt: row.updatedAt?.toISOString(),
      })),
      total: result.total,
      page,
      limit,
    };
  }

  async getAdminCompanyById(companyId: string) {
    const row = await this.companiesRepository.getAdminCompanyById(companyId);
    if (!row) {
      throw new AppError(404, "Company not found");
    }

    return {
      id: row.id,
      name: row.tradeName,
      cityId: row.cityId,
      nicheId: row.nicheId,
      addressLine: row.address ?? "",
      phoneE164: row.phone ?? null,
      whatsappE164: row.whatsapp ?? null,
      website: row.website ?? null,
      lat: row.lat ?? null,
      lng: row.lng ?? null,
      status: row.status,
      participatesInAuction: row.participatesInAuction,
      hasWhatsapp: row.hasWhatsapp,
      origin: row.source,
      qualityScore: row.qualityScore,
      createdAt: row.createdAt?.toISOString(),
      updatedAt: row.updatedAt?.toISOString(),
    };
  }

  async createAdminCompany(userId: string, payload: AdminCompanyPayload) {
    const city = await this.companiesRepository.findCityById(payload.cityId);
    if (!city || !city.isActive) {
      throw new AppError(400, "Invalid city");
    }

    await this.ensureNichesExist([payload.nicheId]);

    const phone = normalizePhoneToE164BR(payload.phoneE164);
    const whatsapp = normalizePhoneToE164BR(payload.whatsappE164);
    const hasWhatsapp = payload.hasWhatsapp ?? Boolean(whatsapp);
    const website = normalizeWebsite(payload.website);
    const addressLine = normalizeAddressLine(payload.addressLine);
    const normalizedName = normalizeName(payload.name);
    const normalizedPhone = toDigits(phone);

    if (payload.hasWhatsapp && !whatsapp) {
      throw new AppError(400, "whatsapp_required");
    }
    if (!phone && !whatsapp) {
      throw new AppError(400, "contact_required");
    }

    const dedupeHits = await findDedupeHits({
      name: payload.name,
      addressLine: payload.addressLine,
      phoneE164: phone,
      whatsappE164: whatsapp,
      website,
    });

    if (dedupeHits.length && !payload.force) {
      return { conflict: true as const, dedupeHits };
    }

    const qualityScore = computeQualityScore({
      name: normalizedName,
      addressLine,
      cityId: payload.cityId,
      nicheId: payload.nicheId,
      phoneE164: phone,
      whatsappE164: whatsapp,
    });

    const status = payload.status ?? "pending";
    if (status === "active" && (qualityScore < ACTIVE_MIN_SCORE || (!phone && !whatsapp))) {
      throw new AppError(400, "status_active_requires_quality", "INVALID_STATUS");
    }

    const created = await this.companiesRepository.createAdminCompany({
      ownerId: userId,
      createdByUserId: userId,
      tradeName: payload.name,
      cityId: payload.cityId,
      address: addressLine,
      phone,
      whatsapp,
      website: website ?? null,
      normalizedPhone,
      normalizedName,
      lat: payload.lat !== undefined ? String(payload.lat) : null,
      lng: payload.lng !== undefined ? String(payload.lng) : null,
      status,
      participatesInAuction: payload.participatesInAuction ?? false,
      hasWhatsapp,
      source: payload.origin ?? "manual",
      qualityScore,
      nicheId: payload.nicheId,
    });

    if (!created) {
      throw new AppError(500, "Failed to create company");
    }

    return {
      id: created.id,
      name: created.tradeName,
      cityId: created.cityId,
      nicheId: created.nicheId,
      addressLine: created.address ?? "",
      phoneE164: created.phone ?? null,
      whatsappE164: created.whatsapp ?? null,
      website: created.website ?? null,
      lat: created.lat ?? null,
      lng: created.lng ?? null,
      status: created.status,
      participatesInAuction: created.participatesInAuction,
      hasWhatsapp: created.hasWhatsapp,
      origin: created.source,
      qualityScore: created.qualityScore,
      createdAt: created.createdAt?.toISOString(),
      updatedAt: created.updatedAt?.toISOString(),
    };
  }

  async updateAdminCompany(companyId: string, payload: Partial<AdminCompanyPayload>) {
    const existing = await this.companiesRepository.getAdminCompanyById(companyId);
    if (!existing) {
      throw new AppError(404, "Company not found");
    }

    if (payload.cityId) {
      const city = await this.companiesRepository.findCityById(payload.cityId);
      if (!city || !city.isActive) {
        throw new AppError(400, "Invalid city");
      }
    }

    if (payload.nicheId) {
      await this.ensureNichesExist([payload.nicheId]);
    }

    const phone =
      payload.phoneE164 !== undefined
        ? normalizePhoneToE164BR(payload.phoneE164)
        : normalizePhoneToE164BR(existing.phone);
    let whatsapp =
      payload.whatsappE164 !== undefined
        ? normalizePhoneToE164BR(payload.whatsappE164)
        : normalizePhoneToE164BR(existing.whatsapp);
    if (payload.hasWhatsapp === false && payload.whatsappE164 === undefined) {
      whatsapp = null;
    }
    const hasWhatsapp =
      payload.hasWhatsapp ??
      (payload.whatsappE164 !== undefined ? Boolean(whatsapp) : existing.hasWhatsapp);
    const website =
      payload.website !== undefined ? normalizeWebsite(payload.website) : normalizeWebsite(existing.website);
    const addressLine =
      payload.addressLine !== undefined
        ? normalizeAddressLine(payload.addressLine)
        : normalizeAddressLine(existing.address);
    const name =
      payload.name !== undefined ? payload.name : existing.tradeName;
    const normalizedName = normalizeName(name);
    const normalizedPhone = toDigits(phone);

    if (payload.hasWhatsapp && !whatsapp) {
      throw new AppError(400, "whatsapp_required");
    }
    const nextStatus = payload.status ?? existing.status;
    if ((nextStatus === "active" || payload.hasWhatsapp) && !phone && !whatsapp) {
      throw new AppError(400, "contact_required");
    }

    const dedupeHits = await findDedupeHits({
      name,
      addressLine,
      phoneE164: phone,
      whatsappE164: whatsapp,
      website,
    });
    const filteredHits = dedupeHits.filter((hit) => hit.id !== existing.id);
    if (filteredHits.length && !payload.force) {
      return { conflict: true as const, dedupeHits: filteredHits };
    }

    const qualityScore = computeQualityScore({
      name: normalizedName,
      addressLine,
      cityId: payload.cityId ?? existing.cityId,
      nicheId: payload.nicheId ?? existing.nicheId,
      phoneE164: phone,
      whatsappE164: whatsapp,
    });

    if (nextStatus === "active" && (qualityScore < ACTIVE_MIN_SCORE || (!phone && !whatsapp))) {
      throw new AppError(400, "status_active_requires_quality", "INVALID_STATUS");
    }

    const updated = await this.companiesRepository.updateAdminCompany(companyId, {
      tradeName: payload.name,
      cityId: payload.cityId,
      address: addressLine,
      phone,
      whatsapp,
      website: website ?? null,
      normalizedPhone,
      normalizedName,
      lat: payload.lat !== undefined ? String(payload.lat) : undefined,
      lng: payload.lng !== undefined ? String(payload.lng) : undefined,
      status: payload.status,
      source: payload.origin,
      qualityScore,
      nicheId: payload.nicheId,
      participatesInAuction: payload.participatesInAuction,
      hasWhatsapp,
    });

    if (!updated) {
      throw new AppError(404, "Company not found");
    }

    return {
      id: updated.id,
      name: updated.tradeName,
      cityId: updated.cityId,
      nicheId: updated.nicheId,
      addressLine: updated.address ?? "",
      phoneE164: updated.phone ?? null,
      whatsappE164: updated.whatsapp ?? null,
      website: updated.website ?? null,
      lat: updated.lat ?? null,
      lng: updated.lng ?? null,
      status: updated.status,
      participatesInAuction: updated.participatesInAuction,
      hasWhatsapp: updated.hasWhatsapp,
      origin: updated.source,
      qualityScore: updated.qualityScore,
      createdAt: updated.createdAt?.toISOString(),
      updatedAt: updated.updatedAt?.toISOString(),
    };
  }

  async setAdminCompanyStatus(companyId: string, status: AdminCompanyPayload["status"]) {
    const existing = await this.companiesRepository.getAdminCompanyById(companyId);
    if (!existing) {
      throw new AppError(404, "Company not found");
    }
    if (status === "active") {
      const qualityScore = computeQualityScore({
        name: normalizeName(existing.tradeName),
        addressLine: normalizeAddressLine(existing.address),
        cityId: existing.cityId,
        nicheId: existing.nicheId,
        phoneE164: normalizePhoneToE164BR(existing.phone),
        whatsappE164: normalizePhoneToE164BR(existing.whatsapp),
      });
      const hasContact = Boolean(existing.phone || existing.whatsapp);
      if (qualityScore < ACTIVE_MIN_SCORE || !hasContact) {
        throw new AppError(400, "status_active_requires_quality", "INVALID_STATUS");
      }
    }
    await this.companiesRepository.updateAdminCompanyStatus(companyId, status ?? "pending");
    return { success: true };
  }

  private async ensureNichesExist(nicheIds: string[]): Promise<void> {
    if (!nicheIds?.length) {
      return;
    }

    const niches = await this.companiesRepository.findNichesByIds(nicheIds);

    if (niches.length !== nicheIds.length) {
      throw new AppError(400, "One or more niches are invalid");
    }
  }

  private mapChannelsInput(
    input?: CompanyChannelsInput
  ): Record<string, string | null | undefined> | undefined {
    if (!input) {
      return undefined;
    }

    return {
      address: input.address ?? null,
      phone: input.phone ?? null,
      whatsapp: input.whatsapp ?? null,
      openingHours: input.openingHours ?? null,
    };
  }

  private async refreshCompanyQuality(companyId: string): Promise<void> {
    const entity = await this.companiesRepository.findCompanyWithNiches(companyId);
    if (!entity) {
      return;
    }

    const qualityScore = computeQualityScore({
      name: entity.company.tradeName,
      addressLine: entity.company.address ?? null,
      cityId: entity.company.cityId,
      nicheId: entity.niches[0]?.id ?? null,
      phoneE164: entity.company.phone ?? null,
      whatsappE164: entity.company.whatsapp ?? null,
    });

    await this.companiesRepository.updateCompanyQualityScore(companyId, qualityScore);
    if (qualityScore >= ACTIVE_MIN_SCORE && entity.company.status !== "active") {
      await this.companiesRepository.updateAdminCompanyStatus(companyId, "active");
    }
  }

  private mapToDto(entity: CompanyEntity): CompanyDto {
    return {
      id: entity.company.id,
      tradeName: entity.company.tradeName,
      legalName: entity.company.legalName ?? undefined,
      city: entity.city
        ? {
            id: entity.city.id,
            name: entity.city.name,
            state: entity.city.state,
            isActive: entity.city.isActive,
          }
        : undefined,
      niches: entity.niches.map((niche) => ({
        id: niche.id,
        label: niche.label,
        slug: niche.slug,
        isActive: niche.isActive,
      })),
      status: entity.company.status,
      channels: {
        phone: entity.company.phone ?? undefined,
        whatsapp: entity.company.whatsapp ?? undefined,
        address: entity.company.address ?? undefined,
        openingHours: entity.company.openingHours ?? undefined,
        latitude: undefined,
        longitude: undefined,
      },
      createdAt: entity.company.createdAt?.toISOString(),
    };
  }

  private async ensureOwnerExists(ownerId: string): Promise<void> {
    const exists = await this.companiesRepository.ownerExists(ownerId);

    if (!exists) {
      throw new AppError(404, "Owner not found");
    }
  }
}
