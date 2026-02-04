import { AppError } from "../../core/errors";
import {
  OfferedByRepository,
  type OfferedByConfigRecord,
  type OfferedByEventInsert,
} from "./offered-by.repository";

export type OfferedByConfigInput = {
  companyId: string;
  cityId?: string | null;
  nicheId?: string | null;
  text?: string | null;
  imageUrl?: string | null;
  website?: string | null;
  promotionsUrl?: string | null;
  phoneE164?: string | null;
  whatsappE164?: string | null;
  isActive?: boolean;
  createdByUserId?: string | null;
};

export type OfferedByDisplay = {
  text: string;
  imageUrl?: string;
  website?: string;
  promotionsUrl?: string;
  phoneE164?: string;
  whatsappE164?: string;
  configId?: string;
  companyId?: string;
};

export type OfferedByEventType = OfferedByEventInsert["type"];
export type OfferedByEventSource = OfferedByEventInsert["source"];
export type OfferedBySearchType = OfferedByEventInsert["searchType"];

export class OfferedByService {
  constructor(
    private readonly repository: OfferedByRepository = new OfferedByRepository()
  ) {}

  async listConfigs(filters?: {
    companyId?: string;
    cityId?: string;
    nicheId?: string;
    isActive?: boolean;
  }) {
    return this.repository.listConfigs(filters);
  }

  async createConfig(payload: OfferedByConfigInput): Promise<OfferedByConfigRecord> {
    const now = new Date();
    return this.repository.createConfig({
      companyId: payload.companyId,
      cityId: payload.cityId ?? null,
      nicheId: payload.nicheId ?? null,
      text: payload.text ?? null,
      imageUrl: payload.imageUrl ?? null,
      website: payload.website ?? null,
      promotionsUrl: payload.promotionsUrl ?? null,
      phoneE164: payload.phoneE164 ?? null,
      whatsappE164: payload.whatsappE164 ?? null,
      isActive: payload.isActive ?? true,
      createdByUserId: payload.createdByUserId ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }

  async updateConfig(id: string, payload: OfferedByConfigInput) {
    return this.repository.updateConfig(id, {
      companyId: payload.companyId,
      cityId: payload.cityId ?? null,
      nicheId: payload.nicheId ?? null,
      text: payload.text ?? null,
      imageUrl: payload.imageUrl ?? null,
      website: payload.website ?? null,
      promotionsUrl: payload.promotionsUrl ?? null,
      phoneE164: payload.phoneE164 ?? null,
      whatsappE164: payload.whatsappE164 ?? null,
      isActive: payload.isActive ?? true,
      createdByUserId: payload.createdByUserId ?? null,
      updatedAt: new Date(),
    });
  }

  async setActive(id: string, isActive: boolean) {
    return this.repository.updateConfig(id, { isActive, updatedAt: new Date() });
  }

  async resolveForSearch(params: { cityId: string; nicheId?: string | null }): Promise<OfferedByDisplay | undefined> {
    const candidates = await this.repository.listActiveCandidates({
      cityId: params.cityId,
      nicheId: params.nicheId ?? null,
    });
    if (!candidates.length) return undefined;

    const scored = candidates.map((row) => {
      let score = 0;
      if (row.config.cityId && row.config.cityId === params.cityId) score += 2;
      if (row.config.nicheId && row.config.nicheId === params.nicheId) score += 2;
      return { row, score };
    });

    scored.sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      const aTime = a.row.config.updatedAt?.getTime?.() ?? 0;
      const bTime = b.row.config.updatedAt?.getTime?.() ?? 0;
      return bTime - aTime;
    });

    const winner = scored[0]?.row;
    if (!winner) return undefined;

    const fallbackText =
      winner.company?.tradeName ??
      winner.company?.legalName ??
      "Patrocinador";

    return {
      text: winner.config.text ?? fallbackText,
      imageUrl: winner.config.imageUrl ?? undefined,
      website: winner.config.website ?? winner.company?.website ?? undefined,
      promotionsUrl: winner.config.promotionsUrl ?? undefined,
      phoneE164: winner.config.phoneE164 ?? winner.company?.phone ?? undefined,
      whatsappE164: winner.config.whatsappE164 ?? winner.company?.whatsapp ?? undefined,
      configId: winner.config.id,
      companyId: winner.config.companyId,
    };
  }

  async recordEvent(params: {
    configId: string;
    companyId: string;
    searchId?: string | null;
    cityId?: string | null;
    nicheId?: string | null;
    source: OfferedByEventSource;
    type: OfferedByEventType;
    searchType?: OfferedBySearchType;
  }): Promise<void> {
    await this.repository.insertEvent({
      configId: params.configId,
      companyId: params.companyId,
      searchId: params.searchId ?? null,
      cityId: params.cityId ?? null,
      nicheId: params.nicheId ?? null,
      source: params.source,
      type: params.type,
      searchType: params.searchType ?? "niche",
      createdAt: new Date(),
    });
  }

  async getConfigRow(configId: string) {
    const row = await this.repository.findRowById(configId);
    if (!row) {
      throw new AppError(404, "offered_by_config_not_found");
    }
    return row;
  }

  async getDashboard(params: { configId: string; from?: string; to?: string }) {
    const row = await this.getConfigRow(params.configId);
    const from = params.from ? new Date(params.from) : undefined;
    const to = params.to ? new Date(params.to) : undefined;

    const [totals, byCity, byNiche, byDay, byHour, bySearchType] = await Promise.all([
      this.repository.getDashboardTotals({ configId: params.configId, from, to }),
      this.repository.getDashboardByCity({ configId: params.configId, from, to }),
      this.repository.getDashboardByNiche({ configId: params.configId, from, to }),
      this.repository.getDashboardByDay({ configId: params.configId, from, to }),
      this.repository.getDashboardByHour({ configId: params.configId, from, to }),
      this.repository.getDashboardBySearchType({ configId: params.configId, from, to }),
    ]);

    return {
      config: row,
      totals,
      byCity,
      byNiche,
      byDay,
      byHour,
      bySearchType,
    };
  }
}
