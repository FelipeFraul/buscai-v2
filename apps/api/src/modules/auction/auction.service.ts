import {
  AuctionConfigInputSchema,
  AuctionConfigQuerySchema,
  AuctionSlotQuerySchema,
} from "@buscai/shared-schema";
import type { components } from "@buscai/shared-schema/src/api-types";
import { z } from "zod";

import { BillingRepository } from "../billing/billing.repository";
import { mapCompanySummaryToDto } from "../companies/company.mapper";
import { SearchRepository } from "../search/search.repository";

import {
  AuctionRepository,
  type AuctionConfigWithCompany,
} from "./auction.repository";

type AuctionConfigQuery = z.infer<typeof AuctionConfigQuerySchema>;
type AuctionConfigInput = z.infer<typeof AuctionConfigInputSchema>;
type AuctionSlotQuery = z.infer<typeof AuctionSlotQuerySchema>;

type AuctionConfigDto = components["schemas"]["AuctionConfig"];
type AuctionSlotOverview = components["schemas"]["AuctionSlotOverview"];
type AuctionSlotDto = components["schemas"]["AuctionSlot"] & {
  companyId?: string;
  companyName?: string;
  bidCents?: number;
};
type AuctionConfigWithSlots = AuctionConfigDto & { slots?: AuctionSlotDto[] };

type AuctionSummaryStatus =
  | "active"
  | "paused_by_limit"
  | "insufficient_balance"
  | "paused";

export type AuctionSummary = {
  cityId: string;
  nicheId: string;
  marketSlots: Array<{ position: 1 | 2 | 3; currentBidCents: number }>;
  todaySpentCents: number;
  todayImpressionsPaid: number;
  todayClicks: number;
  status: AuctionSummaryStatus;
  walletBalanceCents: number;
  walletReservedCents: number;
  avgPaidPosition: number | null;
  ctr: number | null;
};

export type AuctionPaidCandidate = {
  companyId: string;
  configId: string;
  configCreatedAt?: Date | null;
  cityId: string;
  nicheId: string;
  mode: "manual" | "auto";
  targetPosition?: 1 | 2 | 3;
  marketSnapshot?: Record<1 | 2 | 3, number>;
  autoBidMeta?: {
    usingFloor: boolean;
    thresholdCents: number;
    stepCents: number;
    effectiveBidCents: number;
  };
  dailyBudget: number | null;
  pauseOnLimit: boolean;
  isActive: boolean;
  bids: Record<1 | 2 | 3, number | undefined>;
  company: AuctionConfigWithCompany["company"];
};

export type AuctionRanking = {
  paid: Record<1 | 2 | 3, AuctionPaidCandidate[]>;
  organicPool: AuctionConfigWithCompany["company"][];
};

const BID_STEP_CENTS = 50;

const roundUpToStep = (value: number, step: number) =>
  Math.ceil(value / step) * step;

const missingAmountLogged = new Set<string>();

export class AuctionService {
  constructor(
    private readonly auctionRepository: AuctionRepository,
    private readonly searchRepository: SearchRepository,
    private readonly billingRepository: BillingRepository
  ) {}

  async listConfigs(query: AuctionConfigQuery): Promise<AuctionConfigWithSlots[]> {
    const configs = await this.auctionRepository.listConfigs(query);
    return configs.map((config) => {
      const dto = this.mapConfigToDto(config);
      return {
        ...dto,
        slots: this.buildConfigSlots(dto),
      };
    });
  }

  async upsertConfig(payload: AuctionConfigInput): Promise<AuctionConfigWithSlots> {
    const insertPayload = {
      id: payload.id,
      companyId: payload.companyId,
      cityId: payload.cityId,
      nicheId: payload.nicheId,
      mode: payload.mode === "smart" ? "auto" : payload.mode,
      bidPosition1: payload.bids?.position1?.toString(),
      bidPosition2: payload.bids?.position2?.toString(),
      bidPosition3: payload.bids?.position3?.toString(),
      targetPosition: payload.targetPosition,
      targetShare: payload.targetShare,
      dailyBudget: payload.dailyBudget?.toString(),
      pauseOnLimit: payload.pauseOnLimit ?? true,
      isActive: payload.isActive ?? true,
    };

    const config = await this.auctionRepository.upsertConfig(insertPayload);
    const dto = this.mapConfigToDto(config);
    return {
      ...dto,
      slots: this.buildConfigSlots(dto),
    };
  }

  async listSlots(query: AuctionSlotQuery): Promise<AuctionSlotOverview> {
    const configs = await this.auctionRepository.listConfigs({
      cityId: query.cityId,
      nicheId: query.nicheId,
    });
    const hasActiveConfig = configs.some((config) => config.isActive !== false);
    const ranking = hasActiveConfig
      ? await this.getSearchRanking(query)
      : {
          paid: { 1: [], 2: [], 3: [] },
          organicPool: [],
        };
    const response: AuctionSlotOverview = {
      cityId: query.cityId,
      nicheId: query.nicheId,
      slots: [],
    };

    const winnerIds = new Set<string>();
    if (hasActiveConfig) {
      [1, 2, 3].forEach((position) => {
        const candidate = ranking.paid[position as 1 | 2 | 3][0];
        if (candidate) {
          winnerIds.add(candidate.companyId);
        }
      });
    }

    const organicCandidates = hasActiveConfig
      ? ranking.organicPool.filter((company) => !winnerIds.has(company.id))
      : [];
    const organicPositions = organicCandidates.slice(0, 2);
    const organicIds = organicPositions.map((company) => company.id);

    const companyMap = new Map<string, components["schemas"]["Company"]>();
    if (winnerIds.size > 0 || organicIds.length > 0) {
      const companySummaries = await this.searchRepository.findCompaniesByIds([
        ...winnerIds,
        ...organicIds,
      ]);
      companySummaries.forEach((summary) => {
        companyMap.set(summary.company.id, mapCompanySummaryToDto(summary));
      });
    }

    [1, 2, 3].forEach((position) => {
      const candidate = ranking.paid[position as 1 | 2 | 3][0];
      const company = candidate ? companyMap.get(candidate.companyId) : undefined;
      const companyName =
        company?.tradeName ?? company?.legalName ?? undefined;
      response.slots?.push({
        position,
        company,
        companyId: candidate?.companyId,
        companyName,
        bidCents: candidate ? Math.round(candidate.bids[position as 1 | 2 | 3] ?? 0) : 0,
        currentBid: candidate ? candidate.bids[position as 1 | 2 | 3] ?? 0 : 0,
        type: "auction",
        isActive: hasActiveConfig,
      });
    });

    [4, 5].forEach((position, index) => {
      const organic = organicPositions[index];
      const company = organic ? companyMap.get(organic.id) : undefined;
      const companyName =
        company?.tradeName ?? company?.legalName ?? undefined;
      response.slots?.push({
        position,
        company,
        companyId: organic?.id,
        companyName,
        bidCents: 0,
        currentBid: 0,
        type: "organic",
        isActive: hasActiveConfig,
      });
    });

    return response;
  }

  async getSummary(params: {
    companyId: string;
    cityId: string;
    nicheId: string;
  }): Promise<AuctionSummary> {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const [slotsOverview, wallet, config] = await Promise.all([
      this.listSlots({ cityId: params.cityId, nicheId: params.nicheId }),
      this.billingRepository.getWalletByCompanyId(params.companyId),
      this.auctionRepository
        .listConfigs({
          companyId: params.companyId,
          cityId: params.cityId,
          nicheId: params.nicheId,
        })
        .then((items) => items[0]),
    ]);

    const [todaySpentCents, impressionsFromEvents, todayClicks, avgPaidPosition] =
      await Promise.all([
        this.searchRepository.sumImpressionAmountByCompanyAndConfig({
          companyId: params.companyId,
          cityId: params.cityId,
          nicheId: params.nicheId,
          from: startOfToday,
          to: now,
        }),
        this.searchRepository.countPaidImpressionsByCompanyAndConfig({
          companyId: params.companyId,
          cityId: params.cityId,
          nicheId: params.nicheId,
          from: startOfToday,
          to: now,
        }),
        this.searchRepository.countClicksByCompanyAndConfig({
          companyId: params.companyId,
          cityId: params.cityId,
          nicheId: params.nicheId,
          from: startOfToday,
          to: now,
        }),
        this.searchRepository.getAveragePaidPositionByCompanyAndConfig({
          companyId: params.companyId,
          cityId: params.cityId,
          nicheId: params.nicheId,
          from: startOfToday,
          to: now,
        }),
      ]);

    const missingAmountCount =
      await this.searchRepository.countImpressionsWithMissingAmountByCompanyAndConfig({
        companyId: params.companyId,
        cityId: params.cityId,
        nicheId: params.nicheId,
        from: startOfToday,
        to: now,
      });
    if (missingAmountCount > 0) {
      const logKey = `${params.companyId}:${params.cityId}:${params.nicheId}`;
      if (!missingAmountLogged.has(logKey)) {
        missingAmountLogged.add(logKey);
        console.warn("AUCTION_SUMMARY_MISSING_IMPRESSION_AMOUNT", {
          companyId: params.companyId,
          cityId: params.cityId,
          nicheId: params.nicheId,
          count: missingAmountCount,
        });
      }
    }

    const todayImpressionsPaid =
      impressionsFromEvents > 0
        ? impressionsFromEvents
        : await this.searchRepository.countPaidResultsByCompanyAndConfig({
            companyId: params.companyId,
            cityId: params.cityId,
            nicheId: params.nicheId,
            from: startOfToday,
            to: now,
          });

    const walletBalanceCents = Number(wallet?.balance ?? 0);
    const walletReservedCents = Number(wallet?.reserved ?? 0);

    const dailyBudget = Number(config?.dailyBudget ?? 0);
    const pauseOnLimit = config?.pauseOnLimit ?? true;
    const isActive = config?.isActive ?? true;

    let status: AuctionSummaryStatus = "active";
    if (walletBalanceCents <= 0) {
      status = "insufficient_balance";
    } else if (pauseOnLimit && dailyBudget > 0 && todaySpentCents >= dailyBudget) {
      status = "paused_by_limit";
    } else if (!isActive) {
      status = "paused";
    }

    const marketSlots =
      slotsOverview.slots
        ?.filter((slot) => slot.position && slot.position <= 3)
        .map((slot) => ({
          position: slot.position as 1 | 2 | 3,
          currentBidCents: Math.round(slot.currentBid ?? 0),
        })) ?? [];

    const ctr =
      todayImpressionsPaid > 0 ? todayClicks / todayImpressionsPaid : null;

    return {
      cityId: params.cityId,
      nicheId: params.nicheId,
      marketSlots,
      todaySpentCents: Math.round(todaySpentCents),
      todayImpressionsPaid,
      todayClicks,
      status,
      walletBalanceCents,
      walletReservedCents,
      avgPaidPosition,
      ctr,
    };
  }

  async getSearchRanking(input: {
    cityId: string;
    nicheId: string;
  }): Promise<AuctionRanking> {
    const { configs, organic } = await this.fetchRankingData(
      input.cityId,
      input.nicheId
    );

    return this.buildRanking(configs, organic);
  }

  private sortCandidatesForPosition(
    configs: AuctionConfigWithCompany[],
    position: 1 | 2 | 3,
    marketBids: Record<1 | 2 | 3, number>
  ): AuctionPaidCandidate[] {
    const key =
      position === 1 ? "bidPosition1" : position === 2 ? "bidPosition2" : "bidPosition3";
    const isAutoMode = (mode: string) => mode === "auto" || mode === "smart";

    return configs
      .map((item) => {
        const mode = item.config.mode === "smart" ? "auto" : item.config.mode;
        const manualBids: Record<1 | 2 | 3, number | undefined> = {
          1: Number(item.config.bidPosition1 ?? 0) || undefined,
          2: Number(item.config.bidPosition2 ?? 0) || undefined,
          3: Number(item.config.bidPosition3 ?? 0) || undefined,
        };
        let bids = manualBids;
        let autoBidMeta: AuctionPaidCandidate["autoBidMeta"] = undefined;

        if (isAutoMode(mode)) {
          const target = item.config.targetPosition as 1 | 2 | 3 | null;
          const defaultFloor: Record<1 | 2 | 3, number> = {
            1: 50,
            2: 50,
            3: 50,
          };
          const targetPosition =
            target && target >= 1 && target <= 3 ? target : null;
          const hasMarket = targetPosition ? marketBids[targetPosition] > 0 : false;
          const threshold = targetPosition
            ? hasMarket
              ? marketBids[targetPosition]
              : defaultFloor[targetPosition]
            : defaultFloor[1];
          const step = BID_STEP_CENTS;
          const effectiveBid = roundUpToStep(threshold + 1, step);
          bids = { 1: undefined, 2: undefined, 3: undefined };
          if (targetPosition) {
            bids[targetPosition] = effectiveBid;
            autoBidMeta = {
              usingFloor: !hasMarket,
              thresholdCents: threshold,
              stepCents: step,
              effectiveBidCents: effectiveBid,
            };
          }
        }

        const bidValue = Number(bids[position] ?? 0);
        return {
          companyId: item.company.id,
          configId: item.config.id,
          configCreatedAt: item.config.createdAt ?? null,
          cityId: item.config.cityId,
          nicheId: item.config.nicheId,
          mode,
          targetPosition: item.config.targetPosition ?? undefined,
          marketSnapshot: { ...marketBids },
          autoBidMeta,
          dailyBudget: item.config.dailyBudget ? Number(item.config.dailyBudget) : null,
          pauseOnLimit: item.config.pauseOnLimit ?? true,
          isActive: item.config.isActive ?? true,
          bids,
          company: item.company,
          bidForPosition: bidValue,
        };
      })
      .filter((candidate) => typeof candidate.bidForPosition === "number" && candidate.bidForPosition > 0)
      .sort((a, b) => {
        if ((b.bidForPosition ?? 0) === (a.bidForPosition ?? 0)) {
          if (a.configCreatedAt && b.configCreatedAt) {
            const delta = a.configCreatedAt.getTime() - b.configCreatedAt.getTime();
            if (delta !== 0) {
              return delta;
            }
          }
          // Tie-break deterministico: menor companyId vence.
          return a.companyId.localeCompare(b.companyId);
        }

        return (b.bidForPosition ?? 0) - (a.bidForPosition ?? 0);
      })
      .map(({ bidForPosition: _bid, ...rest }) => rest);
  }

  private mapConfigToDto(config: AuctionConfigWithCompany["config"]): AuctionConfigDto {
    return {
      id: config.id,
      companyId: config.companyId,
      cityId: config.cityId,
      nicheId: config.nicheId,
      mode: config.mode === "smart" ? "auto" : config.mode,
      bids: {
        position1: config.bidPosition1 ? Number(config.bidPosition1) : undefined,
        position2: config.bidPosition2 ? Number(config.bidPosition2) : undefined,
        position3: config.bidPosition3 ? Number(config.bidPosition3) : undefined,
      },
      targetPosition: config.targetPosition ?? undefined,
      targetShare: config.targetShare ?? undefined,
      dailyBudget: config.dailyBudget ? Number(config.dailyBudget) : undefined,
      pauseOnLimit: config.pauseOnLimit ?? undefined,
      isActive: config.isActive ?? undefined,
    };
  }


  private buildConfigSlots(config: AuctionConfigDto): AuctionSlotDto[] {
    const isActive = config.isActive ?? true;
    const bids = config.bids ?? {};
    return [
      {
        position: 1,
        currentBid: bids.position1 ?? 0,
        type: "auction",
        isActive,
      },
      {
        position: 2,
        currentBid: bids.position2 ?? 0,
        type: "auction",
        isActive,
      },
      {
        position: 3,
        currentBid: bids.position3 ?? 0,
        type: "auction",
        isActive,
      },
      {
        position: 4,
        currentBid: 0,
        type: "organic",
        isActive,
      },
      {
        position: 5,
        currentBid: 0,
        type: "organic",
        isActive,
      },
    ];
  }

  private async fetchRankingData(
    cityId: string,
    nicheId: string
  ): Promise<{
    configs: AuctionConfigWithCompany[];
    organic: AuctionConfigWithCompany["company"][];
  }> {
    const configs = await this.auctionRepository.findActiveConfigsForSearch(
      cityId,
      nicheId
    );
    const organic = await this.auctionRepository.findOrganicCompanies(
      cityId,
      nicheId
    );
    return { configs, organic };
  }

  private buildRanking(
    configs: AuctionConfigWithCompany[],
    organic: AuctionConfigWithCompany["company"][]
  ): AuctionRanking {
    const marketBids: Record<1 | 2 | 3, number> = { 1: 0, 2: 0, 3: 0 };
    configs.forEach((item) => {
      if (item.config.mode !== "manual") {
        return;
      }
      const bid1 = Number(item.config.bidPosition1 ?? 0);
      const bid2 = Number(item.config.bidPosition2 ?? 0);
      const bid3 = Number(item.config.bidPosition3 ?? 0);
      if (bid1 > marketBids[1]) marketBids[1] = bid1;
      if (bid2 > marketBids[2]) marketBids[2] = bid2;
      if (bid3 > marketBids[3]) marketBids[3] = bid3;
    });

    const paid = this.ensureDistinctTopCandidates({
      1: this.sortCandidatesForPosition(configs, 1, marketBids),
      2: this.sortCandidatesForPosition(configs, 2, marketBids),
      3: this.sortCandidatesForPosition(configs, 3, marketBids),
    });

    return {
      paid,
      organicPool: organic,
    };
  }

  private ensureDistinctTopCandidates(
    paid: AuctionRanking["paid"]
  ): AuctionRanking["paid"] {
    const picked = new Set<string>();
    const normalizePosition = (position: 1 | 2 | 3) => {
      const candidates = [...(paid[position] ?? [])];
      const index = candidates.findIndex((candidate) => !picked.has(candidate.companyId));
      if (index === -1) {
        return candidates;
      }
      const [chosen] = candidates.splice(index, 1);
      candidates.unshift(chosen);
      picked.add(chosen.companyId);
      return candidates;
    };

    return {
      1: normalizePosition(1),
      2: normalizePosition(2),
      3: normalizePosition(3),
    };
  }
}
