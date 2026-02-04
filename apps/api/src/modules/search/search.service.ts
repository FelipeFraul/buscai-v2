import { randomUUID } from "crypto";

import { SearchClickInputSchema, SearchRequestSchema } from "@buscai/shared-schema";
import type { components, paths } from "@buscai/shared-schema/src/api-types";
import { z } from "zod";

import { AppError } from "../../core/errors";
import { AuctionService, type AuctionRanking } from "../auction/auction.service";
import { BillingService } from "../billing/billing.service";
import { mapCompanySummaryToDto } from "../companies/company.mapper";
import { InternalAuditService } from "../internal-audit/internal-audit.service";
import { ENV } from "../../config/env";
import { ContactService } from "../contacts/contact.service";
import { NotificationsService } from "../notifications/notifications.service";
import { OfferedByService, type OfferedByDisplay } from "../offered-by/offered-by.service";

import { parseSearchIntent } from "./search-intent";
import { SearchRepository, type CompanySummary } from "./search.repository";
import { SerpapiService } from "../serpapi/serpapi.service";
import { db } from "../../core/database/client";
import { users } from "../auth/auth.schema";
import { asc, eq } from "drizzle-orm";
import { getMinimumTokenMatches, normalizeForMatch as normalizeTextForMatch, tokenizeSearch } from "./search-text";
import { logger } from "../../core/logger";

type SearchRequest = z.infer<typeof SearchRequestSchema>;
type SearchClickInput = z.infer<typeof SearchClickInputSchema>;
type SearchResponse = paths["/search"]["post"]["responses"]["200"]["content"]["application/json"];
type PublicSearchDisambiguation = SearchResponse & {
  needsDisambiguation: true;
  nicheOptions: Array<{ nicheId: string; label: string }>;
};

type SearchResultInternal = {
  companyId: string;
  position: number;
  isPaid: boolean;
  chargedAmount: number;
  clickTrackingId?: string;
};

type PublicSearchPayload = {
  text: string;
  city: string;
  niche?: string;
  limit?: number;
  source?: "web" | "whatsapp";
};

type NicheCandidate = {
  nicheId: string;
  label: string;
  score: number;
  matches: number;
  prefixes: number;
  hasActiveAuction: boolean;
  companyCount: number;
};

type NicheResolution = {
  nicheId: string | null;
  matchMeta?:
    | { mode: "explicit" | "strict" | "partial" | "substring"; matches: number; prefixes: number }
    | undefined;
  needsDisambiguation?: boolean;
  options?: Array<{ nicheId: string; label: string }>;
};

export class SearchService {
  constructor(
    private readonly searchRepository: SearchRepository,
    private readonly auctionService: AuctionService,
    private readonly billingService: BillingService,
    private readonly auditService: InternalAuditService,
    private readonly contactService: ContactService,
    private readonly notificationsService?: NotificationsService,
    private readonly serpapiService: SerpapiService = new SerpapiService(),
    private readonly offeredByService?: OfferedByService
  ) {}

    async search(payload: SearchRequest): Promise<SearchResponse> {
    const searchId = randomUUID();

    try {
      const { city, niche } = await this.fetchCityAndNiche(
        payload.cityId,
        payload.nicheId
      );
      const cities = await this.searchRepository.listCities();
      const intent = parseSearchIntent({ ...payload, cities });

      const ranking = await this.auctionService.getSearchRanking({
        cityId: payload.cityId,
        nicheId: payload.nicheId,
      });
      const auctionDisabled = ENV.BUSCAI_DISABLE_AUCTION;
      logger.info("auction.ranking.loaded", {
        searchId,
        cityId: payload.cityId,
        nicheId: payload.nicheId,
        auctionDisabled,
        paidCandidates: {
          pos1: ranking.paid[1]?.length ?? 0,
          pos2: ranking.paid[2]?.length ?? 0,
          pos3: ranking.paid[3]?.length ?? 0,
        },
        organicPool: ranking.organicPool.length,
      });

      const paidResults = auctionDisabled
        ? []
        : await this.resolvePaidPositions(ranking, searchId, {
            city,
            niche,
            forceVisibility: ENV.BUSCAI_FORCE_AUCTION_VISIBILITY,
          });
      if (auctionDisabled) {
        logger.info("auction.skipped", {
          searchId,
          reason: "disabled",
        });
      }
      const paidCompanyIds = paidResults.map((result) => result.companyId);
      logger.info("auction.results.built", {
        searchId,
        paidCount: paidResults.length,
        paidPositions: paidResults.map((result) => result.position),
        forcedVisibility: ENV.BUSCAI_FORCE_AUCTION_VISIBILITY,
      });

      const organicCandidates = ranking.organicPool.filter(
        (company) => !paidCompanyIds.includes(company.id)
      );
      const organicIds = organicCandidates.map((company) => company.id);
      const organicSummaries = await this.searchRepository.findCompaniesByIds(organicIds);
      const organicSummaryMap = new Map(
        organicSummaries.map((summary) => [summary.company.id, summary])
      );

      const orderedOrganic = this.sortOrganicDeterministic(
        organicCandidates,
        organicSummaryMap
      );
      const organicResults = this.buildOrganicResults(
        orderedOrganic,
        paidCompanyIds,
        auctionDisabled ? 1 : 4
      );
      logger.info("auction.results.merge", {
        searchId,
        paidCompanyIds,
        organicCompanyIds: organicResults.map((result) => result.companyId),
      });

      const allResults = [...paidResults, ...organicResults];
      const orderedResults = (auctionDisabled
        ? allResults
            .map((result) => ({
              ...result,
              isPaid: false,
              chargedAmount: 0,
            }))
            .map((result, index) => ({ ...result, rank: index + 1 }))
        : allResults.map((result, index) => ({ ...result, rank: index + 1 })));

      const companyIds = Array.from(new Set(orderedResults.map((result) => result.companyId)));
      const companySummaries = await this.searchRepository.findCompaniesByIds(companyIds);
      const companyMap = new Map<string, components["schemas"]["Company"]>();
      companySummaries.forEach((summary) => {
        companyMap.set(summary.company.id, mapCompanySummaryToDto(summary));
      });

        await this.searchRepository.saveSearchWithResults({
          search: {
            id: searchId,
            queryText: payload.query ?? "",
            cityId: payload.cityId,
            nicheId: payload.nicheId,
            source: payload.source ?? "web",
          },
          results: orderedResults.map((result) => ({
            searchId,
            companyId: result.companyId,
            rank: result.rank,
            position: result.position,
            isPaid: result.isPaid,
            chargedAmount: result.chargedAmount.toString(),
            clickTrackingId: result.clickTrackingId ?? null,
          })),
        });

        const source = payload.source ?? "web";
        const resultsWithCharges =
          source === "whatsapp"
            ? await this.applyImpressionCharges(searchId, orderedResults)
            : orderedResults;

      await this.auditService.logEvent({
        type: "search_performed",
        payload: {
          searchId,
          cityId: payload.cityId,
          nicheId: payload.nicheId,
          source: payload.source ?? "web",
          flags: intent.flags,
        },
      });

      const offeredBy = await this.resolveOfferedBy({
        cityId: payload.cityId,
        nicheId: payload.nicheId,
        companySummaries,
      });

      await this.recordOfferedByEvent({
        offeredBy,
        type: "impression",
        source: payload.source ?? "web",
        searchId,
        cityId: payload.cityId,
        nicheId: payload.nicheId,
        searchType: "niche",
      });

      return {
        searchId,
        offeredBy,
          results: resultsWithCharges.map((result) => ({
            company: companyMap.get(result.companyId),
            rank: result.rank,
            position: result.position,
            isPaid: result.isPaid,
            clickTrackingId: result.clickTrackingId,
            chargedAmount: result.chargedAmount,
          })),
        };
    } catch (error) {
      await this.auditService.logEvent({
        type: "search_error",
        payload: {
          searchId,
          cityId: payload.cityId,
          nicheId: payload.nicheId,
          source: payload.source ?? "web",
          error: (error as Error).message,
        },
      });
      throw error;
    }
  }

  async publicSearch(payload: PublicSearchPayload): Promise<SearchResponse> {
    const [citiesList, nichesList] = await Promise.all([
      this.searchRepository.listCities(),
      this.searchRepository.listNiches(),
    ]);
    if (citiesList.length === 0 || nichesList.length === 0) {
      throw new AppError(503, "system_not_initialized");
    }

    const cityInput = payload.city.trim();
    if (!cityInput) {
      throw new AppError(400, "city_required");
    }

    const cityName = cityInput.split(/[,-]/)[0]?.trim() ?? cityInput;
    const city = await this.searchRepository.findCityByName(cityName);
    if (!city) {
      throw new AppError(400, "city_not_found");
    }

    const limit = Math.max(1, Math.min(payload.limit ?? 5, 7));
    const directCompanies = await this.searchRepository.searchCompaniesByDirectQuery({
      query: payload.text,
      cityId: city.id,
      limit,
    });
    if (this.shouldDirectCompanySearch(payload.text, directCompanies)) {
      return this.buildDirectCompanySearchResponse({
        cityId: city.id,
        queryText: payload.text,
        source: payload.source ?? "web",
        companies: directCompanies,
      });
    }

    let niche = null;
    let nicheMatchMeta:
      | { mode: "explicit" | "strict" | "partial" | "substring"; matches: number; prefixes: number }
      | undefined;
    if (payload.niche?.trim()) {
      niche = await this.searchRepository.findNicheByLabelOrSlug(payload.niche);
      if (niche) {
        nicheMatchMeta = { mode: "explicit", matches: 0, prefixes: 0 };
      }
    } else {
      const queryTokens = tokenizeSearch(payload.text);
      const candidates = await this.getNicheCandidates({
        cityId: city.id,
        text: payload.text,
        limit: 10,
      });
      const resolution = this.resolveNicheFromCandidates(candidates, queryTokens);
      if (resolution.needsDisambiguation && resolution.options?.length) {
        return {
          searchId: randomUUID(),
          results: [],
          needsDisambiguation: true,
          nicheOptions: resolution.options,
        } as PublicSearchDisambiguation;
      }
      if (resolution.nicheId) {
        niche = await this.searchRepository.findNicheById(resolution.nicheId);
        nicheMatchMeta = resolution.matchMeta;
      }

      if (!niche) {
        const niches = await this.searchRepository.listNiches();
        const normalizedText = normalizeTextForMatch(payload.text);
        niche =
          niches.find((item) => {
            const label = normalizeTextForMatch(item.label);
            const slug = normalizeTextForMatch(item.slug);
            return (label && normalizedText.includes(label)) || (slug && normalizedText.includes(slug));
          }) ?? null;
        if (niche) {
          nicheMatchMeta = { mode: "substring", matches: 0, prefixes: 0 };
        }
      }
    }

    if (!niche) {
      const label = payload.niche?.trim() || payload.text.trim();
      const shouldSeed = this.shouldSeedNiche(payload.text);
      const created =
        label && shouldSeed ? await this.trySeedNiche(city.id, label, payload.text, limit) : null;
      if (!created) {
        throw new AppError(400, "niche_not_found");
      }
      niche = created;
      nicheMatchMeta = { mode: "substring", matches: 0, prefixes: 0 };
    } else {
      const activeCount = await this.searchRepository.countActiveCompaniesByCityNiche({
        cityId: city.id,
        nicheId: niche.id,
      });
      if (activeCount === 0) {
        await this.trySeedNiche(city.id, niche.label, payload.text, limit, niche.id);
      }
    }

    logger.info("search.niche.resolved", {
      queryText: payload.text,
      nicheId: niche?.id ?? null,
      nicheLabel: niche?.label ?? null,
      match: nicheMatchMeta ?? null,
    });

    const response = await this.search({
      cityId: city.id,
      nicheId: niche.id,
      query: payload.text,
      source: payload.source ?? "web",
    });

    const injected = await this.injectAuctionPaidResults({
      response,
      searchId: response.searchId,
      cityId: city.id,
      nicheId: niche.id,
    });

    if (injected.results.length > limit) {
      return { ...injected, results: injected.results.slice(0, limit) };
    }

    return injected;
  }

  private async resolveOfferedBy(params: {
    cityId: string;
    nicheId: string;
    companySummaries: CompanySummary[];
  }): Promise<OfferedByDisplay | undefined> {
    if (this.offeredByService) {
      const offered = await this.offeredByService.resolveForSearch({
        cityId: params.cityId,
        nicheId: params.nicheId,
      });
      if (offered) {
        return offered;
      }
    }

    const offeredBySummary = params.companySummaries.find(
      (summary) =>
        summary.company.legalName &&
        summary.company.legalName !== summary.company.tradeName
    );
    if (!offeredBySummary) {
      return undefined;
    }
    return {
      text: offeredBySummary.company.legalName ?? offeredBySummary.company.tradeName,
      website: offeredBySummary.company.website ?? undefined,
      phoneE164: offeredBySummary.company.phone ?? undefined,
      whatsappE164: offeredBySummary.company.whatsapp ?? undefined,
      companyId: offeredBySummary.company.id,
    };
  }

  async recordOfferedByEvent(params: {
    offeredBy?: OfferedByDisplay;
    type: "impression" | "click_whatsapp" | "click_call" | "click_site" | "click_promotions";
    source: "web" | "whatsapp" | "demo";
    searchId?: string | null;
    cityId?: string | null;
    nicheId?: string | null;
    searchType?: "niche" | "company" | "product";
  }): Promise<void> {
    if (!this.offeredByService) return;
    const configId = params.offeredBy?.configId;
    const companyId = params.offeredBy?.companyId;
    if (!configId || !companyId) return;
    await this.offeredByService.recordEvent({
      configId,
      companyId,
      searchId: params.searchId ?? null,
      cityId: params.cityId ?? null,
      nicheId: params.nicheId ?? null,
      source: params.source,
      type: params.type,
      searchType: params.searchType ?? "niche",
    });
  }

  async getOfferedByForContext(params: {
    cityId: string;
    nicheId?: string | null;
  }): Promise<OfferedByDisplay | undefined> {
    if (!this.offeredByService) {
      return undefined;
    }
    return this.offeredByService.resolveForSearch({
      cityId: params.cityId,
      nicheId: params.nicheId ?? null,
    });
  }

  private resolveNicheFromCandidates(
    candidates: NicheCandidate[],
    queryTokens: string[]
  ): NicheResolution {
    if (!candidates.length) {
      return { nicheId: null };
    }

    const minMatches = getMinimumTokenMatches(queryTokens.length);
    const scored = [...candidates].sort((a, b) => {
      const bonusA = (a.hasActiveAuction ? 2 : 0) + Math.min(a.companyCount, 10) / 10;
      const bonusB = (b.hasActiveAuction ? 2 : 0) + Math.min(b.companyCount, 10) / 10;
      const scoreA = a.score + bonusA;
      const scoreB = b.score + bonusB;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return b.companyCount - a.companyCount;
    });

    const [best, second] = scored;
    if (!best) {
      return { nicheId: null };
    }

    const bestScore = best.score + (best.hasActiveAuction ? 2 : 0);
    const secondScore = second
      ? second.score + (second.hasActiveAuction ? 2 : 0)
      : -Infinity;
    const isAmbiguous = second
      ? bestScore - secondScore <= 1 || secondScore >= bestScore * 0.8
      : false;

    if (isAmbiguous) {
      const auctionCandidate = scored.find((candidate) => {
        if (!candidate.hasActiveAuction) return false;
        const candidateScore = candidate.score + 2;
        return candidateScore >= bestScore * 0.9;
      });
      if (auctionCandidate) {
        return {
          nicheId: auctionCandidate.nicheId,
          matchMeta: {
            mode: auctionCandidate.matches >= minMatches ? "strict" : "partial",
            matches: auctionCandidate.matches,
            prefixes: auctionCandidate.prefixes,
          },
        };
      }

      return {
        nicheId: null,
        needsDisambiguation: true,
        options: scored.slice(0, 6).map((candidate) => ({
          nicheId: candidate.nicheId,
          label: candidate.label,
        })),
      };
    }

    return {
      nicheId: best.nicheId,
      matchMeta: {
        mode: best.matches >= minMatches ? "strict" : "partial",
        matches: best.matches,
        prefixes: best.prefixes,
      },
    };
  }

  private shouldSeedNiche(text: string): boolean {
    const tokens = tokenizeSearch(text);
    if (tokens.length < 2) {
      return false;
    }
    return tokens.some((token) => token.length >= 3);
  }

  private shouldDirectCompanySearch(query: string, companies: CompanySummary[]): boolean {
    if (companies.length === 0) {
      return false;
    }
    const digits = query.replace(/\D/g, "");
    if (digits.length >= 8) {
      return true;
    }
    const tokens = tokenizeSearch(query);
    const addressTokens = new Set([
      "rua",
      "av",
      "avenida",
      "travessa",
      "estrada",
      "rodovia",
      "alameda",
      "bairro",
      "numero",
      "n",
      "nº",
    ]);
    if (tokens.some((token) => addressTokens.has(token))) {
      return true;
    }
    const normalizedQuery = normalizeTextForMatch(query);
    const hasExactName = companies.some(
      (item) => normalizeTextForMatch(item.company.tradeName) === normalizedQuery
    );
    if (hasExactName) {
      return true;
    }

    if (tokens.length >= 2) {
      const normalizedTokens = tokens.map((token) => normalizeTextForMatch(token)).filter(Boolean);
      const hasNameTokenMatch = companies.some((item) => {
        const name = normalizeTextForMatch(item.company.tradeName);
        return normalizedTokens.every((token) => name.includes(token));
      });
      if (hasNameTokenMatch) {
        return true;
      }
    }

    return false;
  }

  private async resolveFallbackNicheId(companies: CompanySummary[]): Promise<string> {
    const firstWithNiche = companies.find((company) => company.niches.length > 0);
    if (firstWithNiche?.niches[0]?.id) {
      return firstWithNiche.niches[0].id;
    }

    const niches = await this.searchRepository.listNiches();
    const general =
      niches.find((item) => normalizeTextForMatch(item.label) === "geral") ??
      niches.find((item) => normalizeTextForMatch(item.slug ?? "") === "geral") ??
      niches[0];
    if (!general) {
      throw new AppError(400, "niche_not_found");
    }
    return general.id;
  }

  private async buildDirectCompanySearchResponse(params: {
    cityId: string;
    queryText: string;
    source: "web" | "whatsapp";
    companies: CompanySummary[];
  }): Promise<SearchResponse> {
    const searchId = randomUUID();
    const nicheId = await this.resolveFallbackNicheId(params.companies);

    const results = params.companies.map((summary, index) => ({
      company: mapCompanySummaryToDto(summary),
      rank: index + 1,
      position: index + 1,
      isPaid: false,
      chargedAmount: 0,
      clickTrackingId: undefined,
    }));

    await this.searchRepository.saveSearchWithResults({
      search: {
        id: searchId,
        queryText: params.queryText ?? "",
        cityId: params.cityId,
        nicheId,
        source: params.source,
      },
      results: results.map((result, index) => ({
        searchId,
        companyId: params.companies[index]?.company.id ?? "",
        rank: result.rank,
        position: result.position ?? null,
        isPaid: false,
        chargedAmount: "0",
        clickTrackingId: result.clickTrackingId ?? null,
      })),
    });

    await this.auditService.logEvent({
      type: "search_performed",
      payload: {
        searchId,
        cityId: params.cityId,
        nicheId,
        source: params.source,
        flags: { directCompanySearch: true },
      },
    });

    const offeredBy = await this.resolveOfferedBy({
      cityId: params.cityId,
      nicheId,
      companySummaries: params.companies,
    });

    await this.recordOfferedByEvent({
      offeredBy,
      type: "impression",
      source: params.source,
      searchId,
      cityId: params.cityId,
      nicheId,
      searchType: "company",
    });

    return {
      searchId,
      results,
      offeredBy,
    };
  }

  private async injectAuctionPaidResults(params: {
    response: SearchResponse;
    searchId: string;
    cityId: string;
    nicheId: string;
  }): Promise<SearchResponse> {
    if (ENV.BUSCAI_DISABLE_AUCTION) {
      return params.response;
    }

    const ranking = await this.auctionService.getSearchRanking({
      cityId: params.cityId,
      nicheId: params.nicheId,
    });

    const paidPicks = this.pickDistinctPaidCandidates(ranking);
    const paidCandidates = paidPicks.map((pick) => pick.candidate);
    if (paidCandidates.length === 0) {
      return params.response;
    }

    const paidCompanyIds = paidCandidates.map((candidate) => candidate.companyId);
    const distinctPaidTop3 = new Set(paidCompanyIds).size;
    const distinctBidders = new Set(
      [1, 2, 3]
        .flatMap((position) => ranking.paid[position as 1 | 2 | 3] ?? [])
        .map((candidate) => candidate.companyId)
    ).size;
    logger.info("search.auction.ranking", {
      searchId: params.searchId,
      cityId: params.cityId,
      nicheId: params.nicheId,
      paidCount: paidCompanyIds.length,
      organicCount: ranking.organicPool.length,
      distinctPaidTop3,
      distinctBidders,
      paidCompanyIds,
    });

    const summaries = await this.searchRepository.findCompaniesByIds(paidCompanyIds);
    const summaryMap = new Map(
      summaries.map((summary) => [summary.company.id, summary])
    );
    const existingResults = params.response.results ?? [];
    const existingMap = new Map(
      existingResults
        .map((result) => [result.company?.id ?? "", result])
        .filter(([id]) => Boolean(id))
    );

    const paidResults = paidPicks
      .map(({ candidate, position }, index) => {
        const summary = summaryMap.get(candidate.companyId);
        if (!summary) {
          return null;
        }
        const existing = existingMap.get(candidate.companyId);
        return {
          company: existing?.company ?? mapCompanySummaryToDto(summary),
          rank: index + 1,
          position,
          isPaid: true,
          chargedAmount: existing?.chargedAmount ?? 0,
          clickTrackingId: existing?.clickTrackingId,
        };
      })
      .filter(Boolean) as SearchResponse["results"];

    if (paidResults.length === 0) {
      return params.response;
    }

    const paidIds = new Set(paidResults.map((result) => result.company?.id ?? ""));
    const organicResults = existingResults
      .filter((result) => {
        const companyId = result.company?.id ?? "";
        return !paidIds.has(companyId);
      })
      .map((result, index) => ({
        ...result,
        rank: paidResults.length + index + 1,
        position: paidResults.length + index + 1,
        isPaid: false,
        chargedAmount: result.chargedAmount ?? 0,
      }));

    logger.info("search.auction.injected", {
      searchId: params.searchId,
      paidCount: paidResults.length,
      paidCompanyIds,
      organicCount: organicResults.length,
    });

    logger.info("search.results.flags", {
      searchId: params.searchId,
      results: [...paidResults, ...organicResults].slice(0, 5).map((result, index) => ({
        position: result.position ?? index + 1,
        companyId: result.company?.id ?? null,
        isPaid: result.isPaid ?? false,
      })),
    });

    return {
      ...params.response,
      results: [...paidResults, ...organicResults],
    };
  }

  private pickDistinctPaidCandidates(
    ranking: AuctionRanking
  ): Array<{ position: 1 | 2 | 3; candidate: AuctionRanking["paid"][1][number] }> {
    const selectedCompanies = new Set<string>();
    const picks: Array<{
      position: 1 | 2 | 3;
      candidate: AuctionRanking["paid"][1][number];
    }> = [];

    for (const position of [1, 2, 3] as const) {
      const candidates = ranking.paid[position] ?? [];
      const chosen = candidates.find((candidate) => {
        if (selectedCompanies.has(candidate.companyId)) {
          return false;
        }
        const bid = candidate.bids[position] ?? 0;
        return bid > 0;
      });
      if (chosen) {
        selectedCompanies.add(chosen.companyId);
        picks.push({ position, candidate: chosen });
      }
    }

    return picks;
  }

  async getNicheCandidates(params: {
    cityId: string;
    text: string;
    limit?: number;
  }): Promise<NicheCandidate[]> {
    const queryTokens = tokenizeSearch(params.text);
    if (queryTokens.length === 0) {
      return [];
    }

    const minimumMatches = getMinimumTokenMatches(queryTokens.length);
    const niches = await this.searchRepository.listNiches();
    const scored = niches
      .map((item) => {
        const labelTokens = tokenizeSearch(item.label);
        const slugTokens = tokenizeSearch(item.slug);
        const tokenSet = new Set([...labelTokens, ...slugTokens]);
        const matches = queryTokens.filter((token) => tokenSet.has(token)).length;
        const prefixes = queryTokens.filter((token) =>
          Array.from(tokenSet).some((candidate) => candidate.startsWith(token))
        ).length;
        const score = matches * 2 + prefixes;
        return { item, matches, prefixes, score };
      })
      .filter(
        (entry) =>
          entry.score > 0 &&
          (entry.matches >= minimumMatches || entry.prefixes >= minimumMatches)
      )
      .sort((a, b) => b.score - a.score);

    if (!scored.length) {
      return [];
    }

    const auctionConfigs = await this.auctionService.listConfigs({ cityId: params.cityId });
    const auctionNicheIds = new Set(
      auctionConfigs
        .filter((config) => config.isActive !== false)
        .map((config) => config.nicheId)
        .filter((id): id is string => Boolean(id))
    );

    const limited = scored.slice(0, params.limit ?? 10);
    const companyCounts = await Promise.all(
      limited.map((entry) =>
        this.searchRepository.countActiveCompaniesByCityNiche({
          cityId: params.cityId,
          nicheId: entry.item.id,
        })
      )
    );

    return limited.map((entry, index) => ({
      nicheId: entry.item.id,
      label: entry.item.label,
      score: entry.score,
      matches: entry.matches,
      prefixes: entry.prefixes,
      hasActiveAuction: auctionNicheIds.has(entry.item.id),
      companyCount: companyCounts[index] ?? 0,
    }));
  }

  private pickNicheCandidate(candidates: NicheCandidate[]): NicheCandidate | null {
    if (!candidates.length) {
      return null;
    }

    const scored = [...candidates].sort((a, b) => {
      const bonusA = (a.hasActiveAuction ? 2 : 0) + Math.min(a.companyCount, 10) / 10;
      const bonusB = (b.hasActiveAuction ? 2 : 0) + Math.min(b.companyCount, 10) / 10;
      const scoreA = a.score + bonusA;
      const scoreB = b.score + bonusB;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return b.companyCount - a.companyCount;
    });

    return scored[0] ?? null;
  }

  private async resolveSystemUserId(): Promise<string | null> {
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, "admin"))
      .orderBy(asc(users.createdAt))
      .limit(1);
    return user?.id ?? null;
  }

  private async trySeedNiche(
    cityId: string,
    label: string,
    query: string,
    limit: number,
    nicheId?: string
  ) {
    try {
      const systemUserId = await this.resolveSystemUserId();
      if (!systemUserId) {
        return null;
      }
      const niche =
        nicheId ? { id: nicheId, label } : await this.serpapiService.createNiche(label);
      const serpapiLimit = Math.max(limit, ENV.SERPAPI_DEFAULT_LIMIT);
      await this.serpapiService.startImport(
        systemUserId,
        {
          cityId,
          nicheId: niche.id,
          query,
          limit: serpapiLimit,
          dryRun: false,
        },
        { activateCompanies: true }
      );
      return niche;
    } catch {
      return null;
    }
  }

  async trackEvent(searchId: string, payload: { type: string; companyId?: string }) {
    const search = await this.searchRepository.findSearchById(searchId);
    if (!search) {
      throw new AppError(404, "search_not_found");
    }

    if (payload.type === "impression") {
      const exists = await this.searchRepository.searchEventExists(searchId, "impression");
      if (exists) {
        return;
      }
    } else if (payload.type === "click_whatsapp" || payload.type === "click_call") {
      if (!payload.companyId) {
        throw new AppError(400, "company_id_required");
      }
    } else {
      throw new AppError(400, "invalid_event_type");
    }

    await this.searchRepository.insertSearchEvent({
      searchId,
      companyId: payload.companyId ?? null,
      type: payload.type as "impression" | "click_whatsapp" | "click_call",
    });
  }

  async findSearchById(searchId: string) {
    return this.searchRepository.findSearchById(searchId);
  }

  async buildTrackingRedirect(params: {
    searchId: string;
    companyId: string;
    type: "click_whatsapp" | "click_call";
  }): Promise<string> {
    const search = await this.searchRepository.findSearchById(params.searchId);
    if (!search) {
      throw new AppError(404, "not_found");
    }

    const [summary] = await this.searchRepository.findCompaniesByIds([params.companyId]);
    if (!summary) {
      throw new AppError(404, "not_found");
    }

    const phoneDigits = this.normalizePhoneForLink(summary.company.phone);
    const whatsappDigits = this.normalizePhoneForLink(summary.company.whatsapp);
    let redirectUrl: string | null = null;

    if (params.type === "click_whatsapp") {
      const target = whatsappDigits ?? phoneDigits ?? null;
      if (target) {
        redirectUrl = `https://wa.me/${target}`;
      }
    } else {
      const target = phoneDigits ?? whatsappDigits ?? null;
      if (target) {
        redirectUrl = `tel:+${target}`;
      }
    }

    if (!redirectUrl) {
      throw new AppError(400, "contact_missing");
    }

    try {
      await this.searchRepository.insertSearchEventReturning({
        searchId: params.searchId,
        companyId: params.companyId,
        type: params.type,
      });

      await this.notificationsService?.notifyEvent({
        companyId: params.companyId,
        category: "visibility",
        severity: "low",
        kind: "event",
        title: params.type === "click_whatsapp" ? "Clique no WhatsApp" : "Clique na ligacao",
        message: "Um cliente clicou no seu anuncio.",
        ctaLabel: "Ver performance",
        ctaUrl: "/leilao",
        metadata: {
          searchId: params.searchId,
          channel: params.type,
        },
      });
    } catch {
      // Tracking failure must not block redirect
    }

    return redirectUrl;
  }

  async registerClick(searchId: string, payload: SearchClickInput): Promise<void> {
    const search = await this.searchRepository.findSearchById(searchId);
    if (!search) {
      throw new AppError(404, "Search not found");
    }

    const result = await this.searchRepository.findResultById(payload.resultId);
    if (!result || result.searchId !== searchId) {
      throw new AppError(400, "Result not found for search");
    }

    const trackingId = `${payload.channelType}-${Date.now()}`;
    await this.searchRepository.registerClickByResultId(result.id, trackingId);

    const [companySummary] = await this.searchRepository.findCompaniesByIds([
      result.companyId,
    ]);
    const nicheId = search.nicheId ?? companySummary?.niches?.[0]?.id ?? null;
    const phone =
      payload.channelType === "whatsapp"
        ? companySummary?.company.whatsapp ?? companySummary?.company.phone ?? "unknown"
        : companySummary?.company.phone ?? companySummary?.company.whatsapp ?? "unknown";

    try {
      await this.contactService.recordContact({
        companyId: result.companyId,
        channel: payload.channelType === "whatsapp" ? "whatsapp" : "call",
        phone,
        name: companySummary?.company.tradeName ?? null,
        nicheId,
        createdAt: new Date(),
      });

      await this.notificationsService?.notifyEvent({
        companyId: result.companyId,
        category: "contacts",
        severity: "low",
        kind: "event",
        title:
          payload.channelType === "whatsapp"
            ? "Novo contato via WhatsApp"
            : "Nova ligacao registrada",
        message: "Um cliente entrou em contato.",
        ctaLabel: "Ver contatos",
        ctaUrl: "/leilao",
        metadata: {
          searchId,
          channel: payload.channelType,
          phone,
        },
      });
    } catch (error) {
      await this.auditService.logEvent({
        type: "search_error",
        payload: {
          searchId,
          companyId: result.companyId,
          reason: "contact_event_failed",
          error: (error as Error).message,
        },
      });
    }

    await this.auditService.logEvent({
      type: "search_click",
      payload: {
        searchId,
        companyId: result.companyId,
        channelType: payload.channelType,
        position: result.position,
        isPaid: result.isPaid,
      },
    });
  }

  private async fetchCityAndNiche(cityId: string, nicheId: string) {
    const [city, niche] = await Promise.all([
      this.searchRepository.findCityById(cityId),
      this.searchRepository.findNicheById(nicheId),
    ]);

    if (!city) {
      throw new AppError(404, "City not found");
    }

    if (!niche) {
      throw new AppError(404, "Niche not found");
    }

    return { city, niche };
  }

  async findCityIdByName(cityName: string): Promise<string | null> {
    const cityNameInput = cityName.trim();
    if (!cityNameInput) {
      return null;
    }
    const cityNameNormalized = cityNameInput.split(/[,-]/)[0]?.trim() ?? cityNameInput;
    const city = await this.searchRepository.findCityByName(cityNameNormalized);
    return city?.id ?? null;
  }

    private async resolvePaidPositions(
      ranking: AuctionRanking,
      searchId: string,
      context: {
        city: { id: string; name: string; state: string };
        niche: { id: string; label: string };
        forceVisibility: boolean;
      }
    ): Promise<SearchResultInternal[]> {
      const results: SearchResultInternal[] = [];
      const selectedCompanies = new Set<string>();
      const selectedConfigIds = new Set<string>();
      const skippedDailyLimit = new Set<string>();
      const skippedInsufficientFunds = new Set<string>();
      const loggedAutoConfigs = new Set<string>();
      const candidateMap = new Map<
        string,
        { candidate: AuctionRanking["paid"][1][number]; bid: number }
      >();
      const now = new Date();
      const { startOfToday, endOfToday, bucketDate } = this.getSaoPauloDayRange(now);
      const forceVisibility = context.forceVisibility;

    for (const position of [1, 2, 3] as const) {
      const candidates = ranking.paid[position];
      logger.info("auction.slot.evaluate", {
        searchId,
        position,
        candidateCount: candidates?.length ?? 0,
        forceVisibility,
      });
      if (!candidates) {
        continue;
      }

      const logAutoCandidate = (
        candidate: AuctionRanking["paid"][1][number],
        gating: "eligible" | "blocked_by_limit",
        spentTodayValue: number | null
      ) => {
        const effectiveBid =
          candidate.bids[candidate.targetPosition ?? position] ?? 0;
        console.info("AUTO_BID_CALC", {
          companyId: candidate.companyId,
          cityId: candidate.cityId,
          nicheId: candidate.nicheId,
          targetPosition: candidate.targetPosition,
          marketSnapshot: candidate.marketSnapshot,
          effectiveBidCents: effectiveBid,
          gating: gating === "blocked_by_limit" ? "blocked" : "eligible",
          spentToday: spentTodayValue,
          dailyBudget: candidate.dailyBudget,
          pauseOnLimit: candidate.pauseOnLimit,
          using_floor: candidate.autoBidMeta?.usingFloor ?? false,
        });
      };

      for (const candidate of candidates) {
        const bid = candidate.bids[position] ?? 0;
        if (bid > 0) {
          const existing = candidateMap.get(candidate.configId);
          if (!existing || bid > existing.bid) {
            candidateMap.set(candidate.configId, { candidate, bid });
          }
        }

        if (selectedCompanies.has(candidate.companyId)) {
          continue;
        }

        if (!bid || bid <= 0) {
          logger.info("auction.candidate.skipped", {
            searchId,
            position,
            companyId: candidate.companyId,
            configId: candidate.configId,
            reason: "bid_zero",
          });
          continue;
        }

        let spentToday: number | null = null;
        if (!forceVisibility && candidate.pauseOnLimit && candidate.dailyBudget && candidate.dailyBudget > 0) {
          spentToday = await this.searchRepository.getPaidSpendByCompanyAndConfig({
            companyId: candidate.companyId,
            cityId: candidate.cityId,
            nicheId: candidate.nicheId,
            from: startOfToday,
            to: endOfToday,
          });

          if (spentToday >= candidate.dailyBudget) {
            skippedDailyLimit.add(candidate.configId);
            logger.info("auction.candidate.skipped", {
              searchId,
              position,
              companyId: candidate.companyId,
              configId: candidate.configId,
              reason: "daily_limit",
              spentToday,
              dailyBudget: candidate.dailyBudget,
            });
            if (candidate.mode === "auto" && !loggedAutoConfigs.has(candidate.configId)) {
          logAutoCandidate(candidate, "blocked_by_limit", spentToday);
          loggedAutoConfigs.add(candidate.configId);
        }
            await this.notificationsService?.notifyEvent({
              companyId: candidate.companyId,
              category: "visibility",
              severity: "high",
              kind: "alert",
              title: "Limite diario atingido",
              message: "Seu anuncio foi pausado automaticamente ate amanha.",
              dedupeKey: `daily_limit_${candidate.configId}`,
              bucketDate,
              ctaLabel: "Editar lance",
              ctaUrl: "/lances",
              metadata: {
                cityId: candidate.cityId,
                nicheId: candidate.nicheId,
                dailyBudget: candidate.dailyBudget,
                spentToday,
              },
            });
            continue;
          }
        }

        if (candidate.mode === "auto" && !loggedAutoConfigs.has(candidate.configId)) {
          logAutoCandidate(candidate, "eligible", spentToday);
          loggedAutoConfigs.add(candidate.configId);
        }

        let chargedAmount = bid;
        if (!forceVisibility) {
          const coverage = await this.billingService.canCoverSearchChargeWithDebug({
            companyId: candidate.companyId,
            amount: bid,
          });
          if (!coverage.ok) {
            skippedInsufficientFunds.add(candidate.configId);
            logger.info("auction.candidate.skipped", {
              searchId,
              position,
              companyId: candidate.companyId,
              configId: candidate.configId,
              reason: "insufficient_funds",
              bid,
              walletExists: coverage.walletExists,
              balance: coverage.balance,
              reserved: coverage.reserved,
              available: coverage.available,
              billingReason: coverage.reason,
            });
            await this.notificationsService?.notifyEvent({
              companyId: candidate.companyId,
              category: "financial",
              severity: "high",
              kind: "alert",
              title: "Saldo insuficiente",
              message: "Seu anuncio parou de aparecer nos resultados pagos.",
              dedupeKey: `insufficient_${candidate.configId}`,
              bucketDate,
              ctaLabel: "Comprar creditos",
              ctaUrl: "/creditos",
              metadata: {
                cityId: candidate.cityId,
                nicheId: candidate.nicheId,
                bid,
              },
            });
            continue;
          }
        } else {
          const coverage = await this.billingService.canCoverSearchChargeWithDebug({
            companyId: candidate.companyId,
            amount: bid,
          });
          if (!coverage.ok) {
            chargedAmount = 0;
            logger.info("auction.candidate.forced", {
              searchId,
              position,
              companyId: candidate.companyId,
              configId: candidate.configId,
              bid,
              reason: "forced_visibility_no_balance",
              walletExists: coverage.walletExists,
              balance: coverage.balance,
              reserved: coverage.reserved,
              available: coverage.available,
              billingReason: coverage.reason,
            });
          }
        }

          selectedCompanies.add(candidate.companyId);
          selectedConfigIds.add(candidate.configId);
          results.push({
            companyId: candidate.companyId,
            position,
            isPaid: true,
            chargedAmount,
            clickTrackingId: randomUUID(),
          });
          logger.info("auction.candidate.selected", {
            searchId,
            position,
            companyId: candidate.companyId,
            configId: candidate.configId,
            bid,
            chargedAmount,
            forceVisibility,
          });
          break;
        }
      }

      if (candidateMap.size > 0) {
        for (const { candidate } of candidateMap.values()) {
          if (selectedConfigIds.has(candidate.configId)) {
            continue;
          }
          if (skippedDailyLimit.has(candidate.configId)) {
            continue;
          }
          if (skippedInsufficientFunds.has(candidate.configId)) {
            continue;
          }

          await this.notificationsService?.notifyEvent({
            companyId: candidate.companyId,
            category: "visibility",
            severity: "medium",
            kind: "alert",
            title: "Alguem cobriu sua oferta",
            message: `Outro anunciante superou seu lance em ${context.niche.label} - ${context.city.name}/${context.city.state}.`,
            dedupeKey: `outbid_${candidate.configId}`,
            bucketDate,
            ctaLabel: "Editar lance",
            ctaUrl: "/lances",
            metadata: {
              cityId: candidate.cityId,
              nicheId: candidate.nicheId,
            },
          });
        }
      }

      return results;
    }

    private async applyImpressionCharges(
      searchId: string,
      results: SearchResultInternal[]
    ): Promise<SearchResultInternal[]> {
      const updated = [...results];

      for (const result of updated) {
        if (!result.isPaid || result.chargedAmount <= 0) {
          continue;
        }

        const existing = await this.searchRepository.searchEventExistsForCompany(
          searchId,
          result.companyId,
          "impression"
        );
        if (existing) {
          continue;
        }

        const inserted = await this.searchRepository.insertImpressionEventIfMissing({
          searchId,
          companyId: result.companyId,
          meta: { channel: "whatsapp", amount: result.chargedAmount },
        });

        if (!inserted) {
          continue;
        }

        const charge = await this.billingService.reserveSearchCharge({
          companyId: result.companyId,
          amount: result.chargedAmount,
          searchId,
          position: result.position,
        });

        if (charge.status !== "reserved") {
          await this.searchRepository.deleteSearchEvent({
            searchId,
            companyId: result.companyId,
            type: "impression",
          });

          await this.searchRepository.updateSearchResultPaidStatus({
            searchId,
            companyId: result.companyId,
            isPaid: false,
            chargedAmount: 0,
          });

          result.isPaid = false;
          result.chargedAmount = 0;

          await this.auditService.logEvent({
            type: "search_impression_failed",
            payload: {
              searchId,
              companyId: result.companyId,
              reason: "insufficient_funds",
              position: result.position,
            },
          });
        }
      }

      return updated;
    }

    async recordWhatsappImpressions(
      searchId: string,
      results: Array<{
        companyId: string;
        position: number;
        isPaid: boolean;
        chargedAmount: number;
        clickTrackingId?: string;
      }>
    ): Promise<Array<{
      companyId: string;
      position: number;
      isPaid: boolean;
      chargedAmount: number;
      clickTrackingId?: string;
    }>> {
      return this.applyImpressionCharges(searchId, results);
    }

  private buildOrganicResults(
    organicPool: AuctionRanking["organicPool"],
    excludedCompanyIds: string[],
    startingPosition = 4
  ): SearchResultInternal[] {
    const excluded = new Set(excludedCompanyIds);
    const results: SearchResultInternal[] = [];
    let position = startingPosition;

    for (const company of organicPool) {
      if (excluded.has(company.id)) {
        continue;
      }

      results.push({
        companyId: company.id,
        position,
        isPaid: false,
        chargedAmount: 0,
      });

      excluded.add(company.id);
      position += 1;

      if (position > 5) {
        break;
      }
    }

    return results;
  }

  private sortOrganicDeterministic(
    organicPool: AuctionRanking["organicPool"],
    companySummaries: Map<string, Awaited<ReturnType<SearchRepository["findCompaniesByIds"]>>[number]>
  ): AuctionRanking["organicPool"] {
    return [...organicPool].sort((a, b) => {
      const summaryA = companySummaries.get(a.id);
      const summaryB = companySummaries.get(b.id);
      const qualityA = summaryA?.company.qualityScore ?? (a as { qualityScore?: number }).qualityScore ?? 0;
      const qualityB = summaryB?.company.qualityScore ?? (b as { qualityScore?: number }).qualityScore ?? 0;

      if (qualityB !== qualityA) {
        return qualityB - qualityA;
      }

      const nameA = (summaryA?.company.tradeName ?? a.tradeName ?? "").toString();
      const nameB = (summaryB?.company.tradeName ?? b.tradeName ?? "").toString();
      const nameCompare = nameA.localeCompare(nameB);
      if (nameCompare !== 0) {
        return nameCompare;
      }

      return a.id.localeCompare(b.id);
    });
  }

  private normalizePhoneForLink(value?: string | null): string | null {
    if (!value) return null;
    const digits = value.replace(/\D/g, "");
    return digits ? digits : null;
  }

  private normalizeForMatch(value: string): string {
    return value
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .trim();
  }

  private getSaoPauloDayRange(reference: Date): {
    startOfToday: Date;
    endOfToday: Date;
    bucketDate: string;
  } {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(reference);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const year = Number(values.year);
    const month = Number(values.month);
    const day = Number(values.day);
    const startOfToday = new Date(Date.UTC(year, month - 1, day, 3, 0, 0, 0));
    const endOfToday = new Date(Date.UTC(year, month - 1, day + 1, 2, 59, 59, 999));
    const bucketDate = `${values.year}-${values.month}-${values.day}`;
    return { startOfToday, endOfToday, bucketDate };
  }
}
