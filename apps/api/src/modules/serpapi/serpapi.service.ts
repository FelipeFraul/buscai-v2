import { asc, eq, sql } from "drizzle-orm";

import { SerpapiClient, SerpapiItem } from "./serpapi.client";
import { SerpapiRepository } from "./serpapi.repository";
import { SerpapiRecordStatus, serpapiImportRuns } from "./serpapi.schema";
import { CompaniesRepository } from "../companies/companies.repository";
import { cities, niches } from "../catalog/catalog.schema";
import { db } from "../../core/database/client";
import { ENV } from "../../config/env";
import { decryptSecret, encryptSecret } from "../../core/crypto/secret";
import { AppError } from "../../core/errors";
import { users } from "../auth/auth.schema";
import {
  normalizeAddressLine,
  normalizeName,
  normalizePhoneToE164BR,
  normalizeWebsite,
  toDigits,
} from "../companies/companyNormalization";
import { computeQualityScore } from "../companies/companyQuality";
import { findDedupeHits } from "../companies/companyDedupe";

type ImportRequest = {
  cityId: string;
  nicheId: string;
  query?: string;
  limit?: number;
  dryRun?: boolean;
};

type ManualImportOptions = {
  ignoreDuplicates?: boolean;
  updateExisting?: boolean;
  dryRun?: boolean;
};

type ManualImportPayload = {
  rows: Array<Record<string, unknown>>;
  mapping: {
    name?: string;
    phone?: string;
    address?: string;
    city?: string;
    niche?: string;
    source?: string;
    instagram?: string;
    site?: string;
    url?: string;
  };
  fixedCityId?: string;
  fixedNicheId?: string;
  options?: ManualImportOptions;
};

type UnknownNicheReport = {
  labelOriginal: string;
  labelNormalizado: string;
  count: number;
  examples: string[];
};

export class ManualImportUnknownNichesError extends AppError {
  constructor(public readonly unknownNiches: UnknownNicheReport[]) {
    super(400, "unknown_niches");
  }
}

type ResolveConflictPayload = {
  recordId: string;
  action: "link_existing" | "create_new" | "ignore";
  companyId?: string;
};

type PublishPayload = {
  statusAfter?: "pending" | "active";
  force?: boolean;
  targetCompanyId?: string;
};

type PublishRunPayload = {
  force?: boolean;
};

type ProcessOptions = {
  ignoreDuplicates?: boolean;
  updateExisting?: boolean;
  activateCompanies?: boolean;
};

const normalizePhone = (value?: string | null): string | null => {
  if (!value) {
    return null;
  }
  const digits = value.replace(/\D/g, "");
  return digits.length ? digits : null;
};

const normalizeName = (value?: string | null): string | null => {
  if (!value) {
    return null;
  }
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
  return normalized || null;
};

const resolveSearchPhrase = (query: string | undefined, cityName: string) => {
  if (query && query.trim()) {
    return `${query.trim()} em ${cityName}`;
  }
  return cityName;
};

const maskApiKey = (apiKey: string) => {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    return "****";
  }
  const last4 = trimmed.slice(-4);
  return last4 ? `****${last4}` : "****";
};

export class SerpapiService {
  constructor(
    private readonly repo: SerpapiRepository = new SerpapiRepository(),
    private readonly client: SerpapiClient = new SerpapiClient(),
    private readonly companiesRepository: CompaniesRepository = new CompaniesRepository()
  ) {}

  private parseRecordPayload(raw: unknown) {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    const payload = parsed as Record<string, unknown>;
    return {
      name:
        (payload.title as string | undefined) ??
        (payload.name as string | undefined) ??
        (payload.business_name as string | undefined),
      address:
        (payload.address as string | undefined) ??
        (payload.vicinity as string | undefined) ??
        (payload.formatted_address as string | undefined),
      phone:
        (payload.phone as string | undefined) ??
        (payload.formatted_phone_number as string | undefined),
      website:
        (payload.website as string | undefined) ??
        (payload.url as string | undefined),
    };
  }


  async startImport(
    userId: string,
    payload: ImportRequest,
    options?: { activateCompanies?: boolean }
  ) {
    const importOwnerId = await this.resolveImportOwnerId(userId);
    const [city] = await db.select({ name: cities.name }).from(cities).where(eq(cities.id, payload.cityId)).limit(1);
    if (!city) {
      throw new Error("city_not_found");
    }

    const cityName = city.name;
    const [niche] = await db
      .select({ label: niches.label })
      .from(niches)
      .where(eq(niches.id, payload.nicheId))
      .limit(1);
    const queryFallback = niche?.label?.trim() ?? "";
    const queryInput = payload.query?.trim() ?? "";
    const resolvedQuery = queryInput || queryFallback;

    const searchPhrase = resolveSearchPhrase(resolvedQuery, cityName);
    const limit = payload.limit ?? ENV.SERPAPI_DEFAULT_LIMIT;
    const run = await this.repo.createRun({
      cityId: payload.cityId,
      nicheId: payload.nicheId,
      query: resolvedQuery || null,
      limit,
      dryRun: Boolean(payload.dryRun),
      initiatedByUserId: userId,
      paramsJson: JSON.stringify({
        cityId: payload.cityId,
        nicheId: payload.nicheId,
        query: resolvedQuery || null,
        limit,
        dryRun: Boolean(payload.dryRun),
        source: "serpapi",
      }),
    });

    await this.repo.updateRunStatus(run.id, "running");

    let counters = {
      found: 0,
      inserted: 0,
      updated: 0,
      conflicts: 0,
      errors: 0,
      deduped: 0,
    };

    try {
      const apiKey = await this.resolveSerpapiApiKey();
      const items = await this.client.search(searchPhrase, limit, apiKey);
      counters.found = items.length;
      for (const item of items) {
        await this.processItem(
          run.id,
          payload.cityId,
          payload.nicheId,
          item,
          payload.dryRun ?? false,
          { activateCompanies: options?.activateCompanies },
          counters,
          importOwnerId
        );
      }

      await this.repo.updateRunStatus(run.id, "done", {
        foundCount: counters.found,
        insertedCount: counters.inserted,
        updatedCount: counters.updated,
        conflictCount: counters.conflicts,
        errorCount: counters.errors,
        dedupedCount: counters.deduped,
      });
    } catch (error) {
      await this.repo.updateRunStatus(run.id, "failed");
      throw error;
    }

    return { runId: run.id };
  }

  async getSerpapiApiKeyStatus() {
    try {
      const row = await this.repo.getSerpapiApiKey();
      return {
        isConfigured: Boolean(row?.apiKeyEncrypted),
        updatedAt: row?.apiKeyUpdatedAt ?? null,
        activeApiKeyId: row?.activeApiKeyId ?? null,
      };
    } catch {
      return {
        isConfigured: false,
        updatedAt: null,
        activeApiKeyId: null,
      };
    }
  }

  async updateSerpapiApiKey(apiKey: string, label?: string) {
    if (!apiKey.trim()) {
      throw new AppError(400, "api_key_required");
    }
    const encrypted = encryptSecret(apiKey.trim(), ENV.SERPAPI_ENCRYPTION_KEY);
    const created = await this.repo.insertSerpapiApiKey(encrypted, label);
    if (!created) {
      throw new AppError(500, "serpapi_api_key_create_failed");
    }
    const updated = await this.repo.upsertSerpapiApiKey(encrypted, created.id);
    return {
      isConfigured: true,
      updatedAt: updated?.apiKeyUpdatedAt ?? null,
      activeApiKeyId: created.id,
    };
  }

  private async resolveImportOwnerId(userId: string): Promise<string> {
    const [preferred] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, "admin@buscai.app"))
      .limit(1);
    if (preferred?.id) {
      return preferred.id;
    }

    const [admin] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, "admin"))
      .orderBy(asc(users.createdAt))
      .limit(1);

    return admin?.id ?? userId;
  }

  async selectSerpapiApiKey(apiKeyId: string) {
    const row = await this.repo.getSerpapiApiKeyById(apiKeyId);
    if (!row) {
      throw new AppError(404, "serpapi_api_key_not_found");
    }
    const updated = await this.repo.upsertSerpapiApiKey(row.apiKeyEncrypted, apiKeyId);
    await this.repo.touchSerpapiApiKey(apiKeyId);
    return {
      isConfigured: true,
      updatedAt: updated?.apiKeyUpdatedAt ?? null,
      activeApiKeyId: apiKeyId,
    };
  }

  async listSerpapiApiKeys() {
    try {
      const settings = await this.repo.getSerpapiApiKey();
      const activeApiKeyId = settings?.activeApiKeyId ?? null;
      const rows = await this.repo.listSerpapiApiKeys();

      return rows.map((row) => {
        let masked = "invalida";
        try {
          masked = maskApiKey(decryptSecret(row.apiKeyEncrypted, ENV.SERPAPI_ENCRYPTION_KEY));
        } catch {
          masked = "invalida";
        }
        return {
          id: row.id,
          label: row.label ?? null,
          masked,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
          lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
          isActive: Boolean(activeApiKeyId && row.id === activeApiKeyId),
        };
      });
    } catch {
      return [];
    }
  }

  private async resolveSerpapiApiKey() {
    const stored = await this.repo.getSerpapiApiKey();
    if (stored?.apiKeyEncrypted) {
      try {
        return decryptSecret(stored.apiKeyEncrypted, ENV.SERPAPI_ENCRYPTION_KEY);
      } catch {
        throw new AppError(500, "serpapi_api_key_invalid");
      }
    }
    if (!ENV.SERPAPI_API_KEY) {
      throw new AppError(400, "serpapi_api_key_not_configured");
    }
    return ENV.SERPAPI_API_KEY;
  }

  async startManualImport(userId: string, payload: ManualImportPayload) {
    const options = payload.options ?? {};
    const rows = payload.rows ?? [];
    const cityRows = await db.select({ id: cities.id, name: cities.name, state: cities.state }).from(cities);
    const nicheRows = await db.select({ id: niches.id, label: niches.label }).from(niches);

    const normalizeHeaderKey = (value: string) =>
      value
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_]/g, "")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "");

    const normalizeLookup = (value: string) =>
      value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLowerCase();

    const headerSynonyms: Record<string, string[]> = {
      name: ["nome", "empresa", "razao_social", "fantasia", "title", "name"],
      phone: ["telefone", "celular", "whatsapp", "phone", "tel", "mobile"],
      address: ["endereco", "logradouro", "rua", "address", "street"],
      city: ["cidade", "municipio", "city", "localidade"],
      niche: ["nicho", "categoria", "ramo", "segmento", "category"],
    };

    const cityByKey = new Map<string, string>();
    const cityByName = new Map<string, string>();
    const ambiguousNames = new Set<string>();

    for (const city of cityRows) {
      const nameKey = normalizeLookup(city.name);
      const stateKey = city.state.toLowerCase();
      cityByKey.set(`${nameKey}:${stateKey}`, city.id);
      if (cityByName.has(nameKey) && cityByName.get(nameKey) !== city.id) {
        ambiguousNames.add(nameKey);
      } else {
        cityByName.set(nameKey, city.id);
      }
    }

    const resolveCityId = (value?: string | null) => {
      if (!value) return null;
      const trimmed = value.trim();
      if (!trimmed) return null;
      const match = trimmed.match(/(.*?)(?:\\s*[-/])\\s*([A-Za-z]{2})$/);
      const name = normalizeLookup(match?.[1] ?? trimmed);
      const state = match?.[2]?.toLowerCase() ?? null;
      if (state) {
        return cityByKey.get(`${name}:${state}`) ?? null;
      }
      if (ambiguousNames.has(name)) {
        return null;
      }
      return cityByName.get(name) ?? null;
    };

    const nicheByKey = new Map<string, { id: string; label: string }>();
    for (const niche of nicheRows) {
      const key = normalizeLookup(niche.label);
      if (!key) continue;
      if (!nicheByKey.has(key)) {
        nicheByKey.set(key, niche);
      }
    }

    const prepared: Array<{
      row: Record<string, unknown>;
      index: number;
      cityId: string | null;
      nicheId: string | null;
      name: string | null;
      phone: string | null;
      address: string | null;
      category: string | null;
      cityRaw: string | null;
      source: string | null;
      normalizedPayload: Record<string, unknown> | null;
    }> = [];
    const resolvedCityIds = new Set<string>();
    const resolvedNicheIds = new Set<string>();

    const mapping = payload.mapping ?? {};
    const getMappedValue = (row: Record<string, unknown>, key?: string) => {
      if (!key) return "";
      const raw = row[key];
      return raw === undefined || raw === null ? "" : String(raw).trim();
    };
    const normalizeRowKeys = (row: Record<string, unknown>) => {
      const normalized: Record<string, string> = {};
      Object.entries(row).forEach(([key, value]) => {
        const normalizedKey = normalizeHeaderKey(key);
        if (!normalizedKey) return;
        const text = value === undefined || value === null ? "" : String(value).trim();
        if (!text) return;
        if (!normalized[normalizedKey]) {
          normalized[normalizedKey] = text;
        }
      });
      return normalized;
    };
    const resolveFieldValue = (
      row: Record<string, unknown>,
      normalizedRow: Record<string, string>,
      canonicalKey: keyof typeof headerSynonyms
    ) => {
      const directMapping = mapping[canonicalKey];
      const tryKey = (key?: string) => {
        if (!key) return "";
        const raw = row[key];
        if (raw !== undefined && raw !== null) {
          const text = String(raw).trim();
          if (text) return text;
        }
        const normalizedKey = normalizeHeaderKey(key);
        return normalizedKey ? normalizedRow[normalizedKey] ?? "" : "";
      };

      const direct = directMapping ? tryKey(directMapping) : "";
      if (direct) return direct;

      for (const synonym of headerSynonyms[canonicalKey]) {
        const value = normalizedRow[synonym];
        if (value) return value;
      }

      return "";
    };

    const topNicheCounts = new Map<string, number>();
    let cityFilledCount = 0;
    let nicheEmptyCount = 0;
    for (const [index, row] of rows.entries()) {
      const normalizedRow = normalizeRowKeys(row);
      const name = resolveFieldValue(row, normalizedRow, "name") || null;
      const phone = resolveFieldValue(row, normalizedRow, "phone") || null;
      const address = resolveFieldValue(row, normalizedRow, "address") || null;
      const cityRaw = resolveFieldValue(row, normalizedRow, "city") || null;
      const category = resolveFieldValue(row, normalizedRow, "niche") || null;
      const source = getMappedValue(row, mapping.source) || null;

      if (cityRaw) {
        cityFilledCount += 1;
      }
      if (category && category !== "-") {
        topNicheCounts.set(category, (topNicheCounts.get(category) ?? 0) + 1);
      }

      const cityId = resolveCityId(cityRaw) ?? payload.fixedCityId ?? null;
      let nicheId: string | null = null;

      if (mapping.niche || category) {
        if (!category) {
          nicheEmptyCount += 1;
        } else {
          const key = normalizeLookup(category);
          const match = nicheByKey.get(key);
          if (match) {
            nicheId = match.id;
          } else {
            const created = await this.repo.ensureNiche(category);
            if (created) {
              nicheByKey.set(key, created);
              nicheId = created.id;
            } else {
              throw new AppError(500, "niche_create_failed");
            }
          }
        }
      } else {
        nicheId = payload.fixedNicheId ?? null;
      }

      if (!category && payload.fixedNicheId) {
        nicheId = payload.fixedNicheId;
      }

      if (cityId) {
        resolvedCityIds.add(cityId);
      }
      if (nicheId) {
        resolvedNicheIds.add(nicheId);
      }

      prepared.push({
        row,
        index,
        cityId,
        nicheId,
        name,
        phone,
        address,
        category,
        cityRaw,
        source,
        normalizedPayload: {
          name,
          phone,
          address,
          city: cityRaw,
          niche: category,
        },
      });
    }

    if (!options.dryRun) {
      if (cityFilledCount === 0 && !payload.fixedCityId) {
        throw new AppError(400, "Cidade fixa obrigatoria para importar.");
      }
      if (!payload.fixedNicheId && nicheEmptyCount > 0) {
        throw new AppError(400, "Nicho obrigatorio em todas as linhas ou selecione um nicho fixo.");
      }
    }

    const runCityId =
      payload.fixedCityId ?? (resolvedCityIds.size === 1 ? Array.from(resolvedCityIds)[0] : null);
    const runNicheId =
      payload.fixedNicheId ?? (resolvedNicheIds.size === 1 ? Array.from(resolvedNicheIds)[0] : null);

    if (!options.dryRun) {
      if (!runCityId) {
        throw new AppError(400, "Cidade obrigatoria para importar.");
      }
      if (!mapping.niche && !runNicheId) {
        throw new AppError(400, "Nicho obrigatorio. Selecione um nicho ou mapeie a coluna.");
      }
      if (!payload.fixedCityId && resolvedCityIds.size > 1) {
        throw new AppError(400, "Arquivo contem multiplas cidades. Selecione uma cidade fixa.");
      }
      if (!mapping.niche && !payload.fixedNicheId && resolvedNicheIds.size > 1) {
        throw new AppError(400, "Arquivo contem multiplos nichos. Selecione um nicho fixo.");
      }
    }

    const missingCityCount = prepared.filter((entry) => !entry.cityId).length;
    const missingNicheCount = prepared.filter((entry) => !entry.nicheId).length;

    if (!options.dryRun) {
      if (missingCityCount > 0) {
        throw new AppError(400, "Cidade nao encontrada. Selecione uma cidade valida.");
      }
      if (missingNicheCount > 0) {
        throw new AppError(400, "Nicho obrigatorio. Selecione um nicho ou mapeie a coluna.");
      }
    }

    const run = await this.repo.createRun({
      cityId: runCityId,
      nicheId: runNicheId,
      query: "manual_upload",
      limit: rows.length,
      dryRun: Boolean(options.dryRun),
      initiatedByUserId: userId,
      paramsJson: JSON.stringify({
        source: "manual_upload",
        recordCount: rows.length,
        options,
        cityId: runCityId,
        nicheId: runNicheId,
        mapping,
      }),
    });

    await this.repo.updateRunStatus(run.id, "running");

    let counters = {
      found: rows.length,
      inserted: 0,
      updated: 0,
      conflicts: 0,
      errors: 0,
      deduped: 0,
    };

    const recordsToInsert = prepared.map((entry) => {
      const row = entry.row;
      const dedupeFallback = `manual:${run.id}:${entry.index}`;
      const rawPayload = {
        ...row,
        name: entry.name ?? null,
        phone: entry.phone ?? null,
        address: entry.address ?? null,
        category: entry.category ?? null,
        city: entry.cityRaw ?? null,
        source: entry.source ?? "manual_upload",
        importType: "manual_upload",
      };

      return {
        runId: run.id,
        cityId: entry.cityId,
        nicheId: entry.nicheId,
        dedupeKey: dedupeFallback,
        companyId: null,
        status: "conflict",
        reason: null,
        rawPayload,
        normalizedPayload: entry.normalizedPayload,
      };
    });

    const batchSize = 500;
    for (let i = 0; i < recordsToInsert.length; i += batchSize) {
      const batch = recordsToInsert.slice(i, i + batchSize);
      await this.repo.insertRecords(batch);
    }

    await this.repo.updateRunStatus(run.id, "done", {
      foundCount: counters.found,
      insertedCount: 0,
      updatedCount: 0,
      conflictCount: rows.length,
      errorCount: 0,
      dedupedCount: 0,
    });

    const rowsWithResolvedCity = prepared.filter((entry) => Boolean(entry.cityId)).length;
    const rowsWithResolvedNiche = prepared.filter((entry) => Boolean(entry.nicheId)).length;
    const top10NicheLabels = Array.from(topNicheCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([label, count]) => ({ label, count }));

    return {
      runId: run.id,
      rowsReceived: rows.length,
      rowsStored: prepared.length,
      rowsWithResolvedCity,
      rowsWithResolvedNiche,
      top10NicheLabels,
      unknownNiches: [],
    };
  }

  async invalidateRun(runId: string) {
    const run = await this.repo.getRun(runId);
    if (!run) {
      throw new AppError(404, "run_not_found");
    }
    await this.repo.updateRunStatus(runId, "invalidated");
    return { success: true };
  }

  private async processItem(
    runId: string,
    cityId: string,
    nicheId: string | null,
    item: SerpapiItem,
    dryRun: boolean,
    options: ProcessOptions,
    counters: Record<string, number>,
    ownerId: string
  ) {
    const normalizedPhone = normalizePhone(item.phone);
    const normalizedName = normalizeName(item.name);
    const dedupeKey =
      normalizedPhone || (normalizedName && cityId ? `${normalizedName}:${cityId}` : null);

    let status: SerpapiRecordStatus = "inserted";
    let companyId: string | null = null;
    let reason: string | null = null;

    let existingCompany = null;
    if (normalizedPhone) {
      existingCompany = await this.repo.findCompanyByNormalizedPhone(normalizedPhone);
    }
    if (!existingCompany && normalizedName) {
      existingCompany = await this.repo.findCompanyByNameCity(normalizedName, cityId);
    }

    if (existingCompany) {
      const ignoreDuplicates = Boolean(options.ignoreDuplicates);
      const updateExisting = Boolean(options.updateExisting);

      if (ignoreDuplicates) {
        status = "ignored";
        reason = "Ignorado por duplicidade";
        companyId = existingCompany.id;
        counters.deduped += 1;
        await this.repo.insertRecord({
          runId,
          cityId,
          nicheId,
          dedupeKey,
          companyId,
          status,
          reason,
          rawPayload: item.raw,
        });
        return;
      }

      const updates: Record<string, unknown> = {};
      if (item.phone && (updateExisting || !existingCompany.whatsapp)) {
        updates.whatsapp = item.phone;
      }
      if (item.phone && (updateExisting || !existingCompany.phone)) {
        updates.phone = item.phone;
      }
      if (normalizedPhone && (updateExisting || !existingCompany.normalizedPhone)) {
        updates.normalizedPhone = normalizedPhone;
      }
      if (item.address && (updateExisting || !existingCompany.address)) {
        updates.address = item.address;
      }
      if (normalizedName && (updateExisting || !existingCompany.normalizedName)) {
        updates.normalizedName = normalizedName;
      }
      if (options.activateCompanies && existingCompany.status !== "active") {
        updates.status = "active";
      }

      if (Object.keys(updates).length && !dryRun) {
        await this.repo.updateCompany(existingCompany.id, {
          ...updates,
          source: "serpapi",
          sourceRunId: runId,
        });
        status = "updated";
        counters.updated += 1;
      } else {
        status = "conflict";
        reason = dryRun
          ? "Dry run: atualizacao pendente"
          : "Duplicado sem novas informacoes";
        counters.conflicts += 1;
        counters.deduped += 1;
      }

      companyId = existingCompany.id;
    } else {
      if (!dryRun) {
        companyId = await this.repo.insertCompany({
          ownerId,
          tradeName: item.name ?? "Desconhecido",
          cityId,
          phone: item.phone ?? null,
          whatsapp: item.phone ?? null,
          address: item.address ?? null,
          normalizedPhone,
          normalizedName,
          sourceRef: null,
          sourceRunId: runId,
          status: options.activateCompanies ? "active" : undefined,
        });
      }
      status = "inserted";
      counters.inserted += 1;
    }

    if (status === "inserted" && dryRun) {
      counters.inserted -= 1;
    }

    if (!dryRun && companyId && nicheId) {
      await this.repo.linkCompanyToNiche(companyId, nicheId);
    }

    await this.repo.insertRecord({
      runId,
      cityId,
      nicheId,
      dedupeKey,
      companyId,
      status,
      reason,
      rawPayload: item.raw,
    });
  }

  async listRuns(
    page = 1,
    pageSize = 10,
    filters?: { excludeTests?: boolean }
  ) {
    const offset = (page - 1) * pageSize;
    const rows = await this.repo.listRuns(pageSize, offset, filters);
    const safeRuns = rows ?? [];
    const mapped = await Promise.all(
      safeRuns.map(async (run) => {
        let counts = {
          found: run.foundCount,
          inserted: run.insertedCount,
          updated: run.updatedCount,
          conflicts: run.conflictCount,
          errors: run.errorCount,
          deduped: run.dedupedCount,
        };

        if (run.query === "manual_upload" && run.foundCount === 0) {
          const recordCounts = await this.repo.getRunRecordCounts(run.id);
          counts = {
            ...counts,
            found: recordCounts.total,
            inserted: recordCounts.inserted,
            updated: recordCounts.updated,
            conflicts: recordCounts.conflicts,
            errors: recordCounts.errors,
          };
        }

        return {
          id: run.id,
          status: run.status,
          initiatedByUserId: run.initiatedByUserId,
          cityId: run.cityId,
          nicheId: run.nicheId,
          query: run.query,
          paramsJson: run.paramsJson,
          dryRun: run.dryRun,
          found: counts.found,
          inserted: counts.inserted,
          updated: counts.updated,
          conflicts: counts.conflicts,
          errors: counts.errors,
          deduped: counts.deduped,
          createdAt: run.createdAt,
          finishedAt: run.finishedAt,
        };
      })
    );

    return mapped;
  }

  async getRunDetails(runId: string, opts: { status?: string; page?: number; pageSize?: number }) {
    const run = await this.repo.getRun(runId);
    if (!run) {
      return null;
    }
    const page = opts.page ?? 1;
    const pageSize = opts.pageSize ?? 20;
    const offset = (page - 1) * pageSize;
    const records = await this.repo.listRecords(runId, {
      status: opts.status,
      limit: pageSize,
      offset,
    });

    const payload = records.items.map((record) => ({
      id: record.id,
      status: record.status,
      companyId: record.companyId,
      dedupeKey: record.dedupeKey,
      reason: record.reason,
      rawPreview: this.buildPreview(record.rawPayload),
    }));

    return {
      run: {
        id: run.id,
        status: run.status,
        initiatedByUserId: run.initiatedByUserId,
        cityId: run.cityId,
        nicheId: run.nicheId,
        query: run.query,
        paramsJson: run.paramsJson,
        dryRun: run.dryRun,
        found: run.foundCount,
        inserted: run.insertedCount,
        updated: run.updatedCount,
        conflicts: run.conflictCount,
        errors: run.errorCount,
        deduped: run.dedupedCount,
        createdAt: run.createdAt,
        finishedAt: run.finishedAt,
      },
      records: {
        items: payload,
        total: records.total,
      },
    };
  }

  async listRecordsForRun(
    runId: string,
    opts: { status?: string; limit?: number; offset?: number } = {}
  ) {
    let run;
    try {
      run = await this.repo.getRun(runId);
    } catch (error) {
      throw new AppError(500, "Falha ao consultar execução");
    }

    if (!run) {
      return null;
    }

    const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);
    const offset = Math.max(opts.offset ?? 0, 0);

    let records;
    try {
      records = await this.repo.listRecords(runId, {
        status: opts.status,
        limit,
        offset,
      });
    } catch (error) {
      throw new AppError(500, "Falha ao listar registros");
    }

    return {
      items: records.items.map((record) => ({
        id: record.id,
        status: record.status,
        companyId: record.companyId,
        dedupeKey: record.dedupeKey,
        reason: record.reason,
        rawPreview: this.formatPreview(record.rawPayload),
      })),
      total: records.total,
      limit,
      offset,
    };
  }

  private formatPreview(raw: unknown): string {
    if (!raw) {
      return "{}";
    }

    const allowedFields = ["title", "name", "address", "website"] as const;
    const truncate = (value: string, max = 2000) =>
      value.length <= max ? value : `${value.slice(0, max - 3)}...`;

    const buildPreviewObject = (input: unknown) => {
      if (input && typeof input === "object") {
        return allowedFields.reduce<Record<string, unknown>>((acc, field) => {
          const value = (input as Record<string, unknown>)[field];
          if (typeof value === "string" && value.trim()) {
            acc[field] = value.trim();
          }
          return acc;
        }, {});
      }
      return null;
    };

    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      const previewObject = buildPreviewObject(parsed);
      const safePreview =
        previewObject && Object.keys(previewObject).length ? previewObject : {};
      const stringified = JSON.stringify(safePreview);
      return truncate(stringified.replace(/\s+/g, " ").trim());
    } catch {
      return "{}";
    }
  }

  async resolveConflict(payload: ResolveConflictPayload) {
    const record = await this.repo.getRecordById(payload.recordId);
    if (!record) {
      throw new Error("record_not_found");
    }

    if (payload.action === "link_existing") {
      if (!payload.companyId) {
        throw new Error("company_id_required");
      }
      await this.repo.updateRecordStatus({
        recordId: payload.recordId,
        status: "updated",
        companyId: payload.companyId,
        reason: "Vínculo manual existente",
      });
    } else if (payload.action === "create_new") {
      if (!payload.companyId) {
        throw new Error("company_id_required");
      }
      await this.repo.updateRecordStatus({
        recordId: payload.recordId,
        status: "inserted",
        companyId: payload.companyId,
        reason: "Novo cadastro forçado pelo admin",
      });
    } else {
      await this.repo.updateRecordStatus({
        recordId: payload.recordId,
        status: "ignored",
        reason: "Ignorado pelo admin",
      });
    }

    return { success: true };
  }

  async publishRecord(
    userId: string,
    runId: string,
    recordId: string,
    payload: PublishPayload
  ) {
    const importOwnerId = await this.resolveImportOwnerId(userId);
    const run = await this.repo.getRun(runId);
    if (!run) {
      throw new AppError(404, "run_not_found");
    }

    const record = await this.repo.getRecordById(recordId);
    if (!record || record.runId !== runId) {
      throw new AppError(404, "record_not_found");
    }

    if (payload.targetCompanyId) {
      const existing = await this.companiesRepository.getAdminCompanyById(payload.targetCompanyId);
      if (!existing) {
        throw new AppError(404, "company_not_found");
      }
      await this.repo.markRecordPublished({
        recordId,
        companyId: payload.targetCompanyId,
        publishedByUserId: userId,
        publishStatus: "linked",
        status: "updated",
      });
      return { companyId: payload.targetCompanyId, mode: "linked" };
    }

    let parsed;
    try {
      parsed = this.parseRecordPayload(record.rawPayload);
    } catch {
      throw new AppError(400, "invalid_record_payload");
    }
    if (!parsed) {
      throw new AppError(400, "invalid_record_payload");
    }

    if (!parsed.name || !parsed.address) {
      throw new AppError(400, "missing_required_fields");
    }

    if (!run.cityId || !run.nicheId) {
      throw new AppError(400, "missing_city_or_niche");
    }

    const phoneE164 = normalizePhoneToE164BR(parsed.phone);
    if (!phoneE164) {
      throw new AppError(400, "contact_required");
    }

    const website = normalizeWebsite(parsed.website);
    const addressLine = normalizeAddressLine(parsed.address);
    const normalizedName = normalizeName(parsed.name);
    const phoneDigits = toDigits(phoneE164);

    const dedupeHits = await findDedupeHits({
      name: parsed.name,
      addressLine,
      phoneE164,
      whatsappE164: null,
      website,
    });

    if (dedupeHits.length && !payload.force) {
      return { conflict: true, dedupeHits };
    }

    const qualityScore = computeQualityScore({
      name: normalizedName,
      addressLine,
      cityId: run.cityId,
      nicheId: run.nicheId,
      phoneE164,
    });
    const desiredStatus = payload.statusAfter ?? "pending";
    if (desiredStatus === "active" && qualityScore < 70) {
      throw new AppError(400, "status_active_requires_quality", "INVALID_STATUS");
    }

    const created = await this.companiesRepository.createAdminCompany({
      ownerId: importOwnerId,
      createdByUserId: userId,
      tradeName: parsed.name,
      cityId: run.cityId,
      address: addressLine,
      phone: phoneE164,
      whatsapp: null,
      website: website ?? null,
      normalizedPhone: phoneDigits,
      normalizedName,
      status: desiredStatus,
      source: "serpapi",
      qualityScore,
      nicheId: run.nicheId,
    });

    if (!created) {
      throw new AppError(500, "company_create_failed");
    }

    await this.repo.markRecordPublished({
      recordId,
      companyId: created.id,
      publishedByUserId: userId,
      publishStatus: "created",
      status: "inserted",
    });

    return { companyId: created.id, mode: "created" };
  }

  async exportData(runId: string, type: "runs" | "records" | "conflicts" | "companies") {
    if (type === "runs") {
      const run = await this.repo.getRun(runId);
      if (!run) {
        throw new Error("run_not_found");
      }
      return [
        ["id", "status", "cityId", "nicheId", "query", "found", "inserted", "updated", "conflicts", "errors", "createdAt", "finishedAt"],
        [
          run.id,
          run.status,
          run.cityId ?? "",
          run.nicheId ?? "",
          run.query ?? "",
          run.foundCount,
          run.insertedCount,
          run.updatedCount,
          run.conflictCount,
          run.errorCount,
          run.createdAt.toISOString(),
          run.finishedAt?.toISOString() ?? "",
        ],
      ];
    }

    const records = await this.repo.listRecords(runId, {
      status: type === "conflicts" ? "conflict" : undefined,
      limit: 10_000,
      offset: 0,
    });

    const rows = [
      ["id", "status", "companyId", "dedupeKey", "reason", "rawPayload"],
      ...records.items.map((record) => [
        record.id,
        record.status,
        record.companyId ?? "",
        record.dedupeKey ?? "",
        record.reason ?? "",
        typeof record.rawPayload === "string" ? record.rawPayload : JSON.stringify(record.rawPayload),
      ]),
    ];

    return rows;
  }

  async exportFilteredRecords(filters: {
    periodDays?: number;
    cityId?: string;
    nicheId?: string;
  }) {
    const createdAfter = filters.periodDays
      ? new Date(Date.now() - filters.periodDays * 24 * 60 * 60 * 1000)
      : null;
    const rows = await this.repo.listRecordsWithRuns({
      cityId: filters.cityId,
      nicheId: filters.nicheId,
      createdAfter,
    });

    return rows.map((row) => {
      const parsed = this.parseRecordPayload(row.rawPayload);
      return {
        runId: row.runId,
        status: row.status,
        name: parsed?.name ?? "",
        phone: parsed?.phone ?? "",
        address: parsed?.address ?? "",
        website: parsed?.website ?? "",
        cityId: row.cityId ?? "",
        cityName: row.cityName ?? "",
        cityState: row.cityState ?? "",
        nicheId: row.nicheId ?? "",
        nicheName: row.nicheName ?? "",
        query: row.query ?? "",
        source: row.query === "manual_upload" ? "Upload" : "Maps",
        createdAt: row.createdAt.toISOString(),
      };
    });
  }

  async listNicheDistribution(query?: string) {
    if (!query) {
      const linkCount = await this.repo.countSerpapiNicheLinks();
      if (linkCount === 0) {
        await this.backfillManualNicheLinks();
      }
    }
    return this.repo.listNicheDistribution(query);
  }

  async getAllTimeMetrics() {
    return this.repo.getAllTimeMetrics();
  }

  async listNicheCompanies(nicheId: string) {
    const niche = await this.repo.getNicheById(nicheId);
    if (!niche) {
      throw new AppError(404, "niche_not_found");
    }
    const companies = await this.repo.listCompaniesByNiche(nicheId);
    return {
      niche,
      companies: companies.map((company) => ({
        id: company.id,
        name: company.name,
        address: company.address ?? null,
        phone: company.phone ?? null,
        whatsapp: company.whatsapp ?? null,
        hasWhatsapp: company.hasWhatsapp ?? Boolean(company.whatsapp),
        source: company.source,
        createdAt: company.createdAt.toISOString(),
      })),
    };
  }

  async reprocessNiche(userId: string, nicheId: string) {
    const latestRun = await this.repo.getLatestRunByNiche(nicheId);
    if (!latestRun || !latestRun.cityId) {
      throw new AppError(404, "niche_run_not_found");
    }
    const limit =
      latestRun.foundCount && latestRun.foundCount > 0
        ? latestRun.foundCount
        : ENV.SERPAPI_DEFAULT_LIMIT;
    return this.startImport(userId, {
      cityId: latestRun.cityId,
      nicheId: latestRun.nicheId ?? nicheId,
      query: latestRun.query ?? undefined,
      limit,
      dryRun: false,
    });
  }

  async deleteNicheCompanies(nicheId: string) {
    const niche = await this.repo.getNicheById(nicheId);
    if (!niche) {
      throw new AppError(404, "niche_not_found");
    }
    await this.repo.deleteNicheCompanies(nicheId);
    return { success: true };
  }

  async deleteNiche(nicheId: string) {
    const niche = await this.repo.getNicheById(nicheId);
    if (!niche) {
      throw new AppError(404, "niche_not_found");
    }
    await this.repo.deleteNicheWithData(nicheId);
    return { success: true };
  }

  async deleteCompanyFromNiche(nicheId: string, companyId: string) {
    await this.repo.deleteCompanyFromNiche(nicheId, companyId);
    return { success: true };
  }

  async exportCompanies(nicheId?: string) {
    const rows = await this.repo.listCompaniesForExport(nicheId);
    return rows.map((row) => ({
      companyId: row.companyId,
      tradeName: row.tradeName,
      address: row.address ?? "",
      phone: row.phone ?? "",
      whatsapp: row.whatsapp ?? "",
      city: row.cityName ? `${row.cityName} / ${row.cityState ?? ""}` : "",
      niche: row.nicheName ?? "",
      source: row.source,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async exportFull() {
    const rows = await this.repo.listCompaniesForExport();
    return rows.map((row) => ({
      niche: row.nicheName ?? "",
      name: row.tradeName ?? "",
      address: row.address ?? "",
      phone: row.phone ?? "",
      whatsapp: row.whatsapp ?? "",
      source: row.source ?? "",
      city: row.cityName ? `${row.cityName} / ${row.cityState ?? ""}` : "",
    }));
  }

  async publishManualRun(userId: string, runId: string, payload: PublishRunPayload) {
    const run = await this.repo.getRun(runId);
    if (!run) {
      throw new AppError(404, "run_not_found");
    }
    if (run.dryRun) {
      throw new AppError(400, "dry_run_nao_publicavel");
    }
    if (run.query !== "manual_upload") {
      throw new AppError(400, "run_nao_suporta_publicacao");
    }

    const records = await this.repo.listRecordsForPublish(runId);
    if (!records.length) {
      return { inserted: 0, deduped: 0, skipped: 0 };
    }

      let processed = 0;
      let inserted = 0;
      let deduped = 0;
      let errors = 0;
      const errorSamples: Array<{ recordId: string; reason: string }> = [];
      const force = Boolean(payload.force);

      const importOwnerId = await this.resolveImportOwnerId(userId);
      for (const record of records) {
        if (
          record.companyId ||
        record.status === "inserted" ||
        record.status === "ignored" ||
          record.status === "error" ||
          record.status === "updated"
        ) {
          continue;
        }
        processed += 1;

        let normalizedPayload: Record<string, unknown> | null = null;
        if (record.normalizedPayload) {
          if (typeof record.normalizedPayload === "string") {
            try {
              normalizedPayload = JSON.parse(record.normalizedPayload) as Record<string, unknown>;
            } catch {
              normalizedPayload = null;
            }
          } else {
            normalizedPayload = record.normalizedPayload as Record<string, unknown>;
          }
        }

        const name = String(normalizedPayload?.name ?? "").trim();
        if (!name) {
          errors += 1;
          if (errorSamples.length < 10) {
            errorSamples.push({ recordId: record.id, reason: "MISSING_NAME" });
          }
          await this.repo.updateRecordStatus({
            recordId: record.id,
            status: "error",
            reason: "MISSING_NAME",
          });
          continue;
        }

        const address = normalizedPayload?.address ? String(normalizedPayload.address).trim() : null;
        const phone = normalizedPayload?.phone ? String(normalizedPayload.phone).trim() : null;

      const resolvedCityId = record.cityId ?? run.cityId ?? null;
      const resolvedNicheId = record.nicheId ?? run.nicheId ?? null;

        if (!resolvedCityId) {
          errors += 1;
          if (errorSamples.length < 10) {
            errorSamples.push({ recordId: record.id, reason: "MISSING_CITY" });
          }
          await this.repo.updateRecordStatus({
            recordId: record.id,
            status: "error",
            reason: "MISSING_CITY",
          });
          continue;
        }
        if (!resolvedNicheId) {
          errors += 1;
          if (errorSamples.length < 10) {
            errorSamples.push({ recordId: record.id, reason: "MISSING_NICHE" });
          }
          await this.repo.updateRecordStatus({
            recordId: record.id,
            status: "error",
            reason: "MISSING_NICHE",
          });
          continue;
        }

      const normalizedPhone = normalizePhone(phone ?? null);
      const normalizedNameValue = normalizeName(name);
      const addressLine = address ? normalizeAddressLine(address) : null;

      const dedupeHits = await findDedupeHits({
        name,
        addressLine,
        phoneE164: phone ?? null,
        whatsappE164: null,
        website: null,
      });
      const existing = dedupeHits.find((hit) => hit.cityId === resolvedCityId) ?? null;

      if (existing && !force) {
        deduped += 1;
        await this.repo.linkCompanyToNiche(existing.id, resolvedNicheId);
        await this.repo.updateRecordStatus({
          recordId: record.id,
          status: "ignored",
          companyId: existing.id,
          reason: "Duplicado",
        });
        continue;
      }

      const companyId = await this.repo.insertCompany({
        ownerId: importOwnerId,
        tradeName: name,
        cityId: resolvedCityId,
        phone: phone ?? null,
        whatsapp: phone ?? null,
        address: address ?? null,
        normalizedPhone,
        normalizedName: normalizedNameValue,
        sourceRef: null,
        sourceRunId: runId,
      });

        if (!companyId) {
          errors += 1;
          if (errorSamples.length < 10) {
            errorSamples.push({ recordId: record.id, reason: "CREATE_FAILED" });
          }
          await this.repo.updateRecordStatus({
            recordId: record.id,
            status: "error",
            reason: "CREATE_FAILED",
          });
          continue;
        }

      inserted += 1;
      await this.repo.linkCompanyToNiche(companyId, resolvedNicheId);
      await this.repo.updateRecordStatus({
        recordId: record.id,
        status: "inserted",
        companyId,
      });
    }

      if (inserted || deduped || errors) {
        await this.repo.incrementCounts(runId, {
          insertedCount: inserted,
          conflictCount: 0,
          errorCount: errors,
          foundCount: 0,
        });
        if (deduped) {
          await db
            .update(serpapiImportRuns)
            .set({ dedupedCount: sql`${serpapiImportRuns.dedupedCount} + ${deduped}` })
            .where(eq(serpapiImportRuns.id, runId));
        }
      }

      return { processed, inserted, deduped, errors, errorSamples, skipped: errors };
    }

  private async backfillManualNicheLinks() {
    const records = await this.repo.listManualImportRecordsForNicheBackfill();
    if (!records.length) {
      return;
    }

    for (const record of records) {
      let parsed: Record<string, unknown> | null = null;
      try {
        parsed =
          typeof record.rawPayload === "string"
            ? (JSON.parse(record.rawPayload) as Record<string, unknown>)
            : null;
      } catch {
        parsed = null;
      }

      const category =
        typeof parsed?.category === "string" && parsed.category.trim()
          ? parsed.category.trim()
          : null;
      if (!category) {
        continue;
      }

      const niche = await this.repo.ensureNiche(category);
      if (!niche) {
        continue;
      }

      await this.repo.linkCompanyToNiche(record.companyId, niche.id);
    }
  }

  async createNiche(label: string) {
    const trimmed = label.trim();
    if (!trimmed) {
      throw new AppError(400, "invalid_niche_label");
    }
    const niche = await this.repo.ensureNiche(trimmed);
    if (!niche) {
      throw new AppError(400, "invalid_niche_label");
    }
    return niche;
  }

  async updateNicheLabel(nicheId: string, label: string) {
    const trimmed = label.trim();
    if (!trimmed) {
      throw new AppError(400, "invalid_niche_label");
    }

    const current = await this.repo.getNicheForUpdate(nicheId);
    if (!current) {
      throw new AppError(404, "niche_not_found");
    }

    const slug = this.repo.buildNicheSlug(trimmed);
    const conflict = await this.repo.findNicheBySlug(slug);
    if (conflict && conflict.id !== nicheId) {
      throw new AppError(409, "niche_slug_exists");
    }

    const updated = await this.repo.updateNiche(nicheId, { label: trimmed, slug });
    if (!updated) {
      throw new AppError(404, "niche_not_found");
    }

    return updated;
  }

  async createNichesBulk(labels: string[]) {
    const unique = Array.from(
      new Set(labels.map((label) => label.trim()).filter((label) => label.length > 0))
    );
    if (unique.length === 0) {
      throw new AppError(400, "invalid_niche_label");
    }

    let createdCount = 0;
    let existingCount = 0;

    for (const label of unique) {
      const slug = this.repo.buildNicheSlug(label);
      const existing = await this.repo.findNicheBySlug(slug);
      if (existing) {
        existingCount += 1;
        continue;
      }
      const created = await this.repo.ensureNiche(label);
      if (created) {
        createdCount += 1;
      }
    }

    return {
      total: unique.length,
      created: createdCount,
      existing: existingCount,
    };
  }
}
