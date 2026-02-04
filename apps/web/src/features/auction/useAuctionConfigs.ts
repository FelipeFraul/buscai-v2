import { apiClient } from "@/lib/api/client";
import { createMutation, createQuery } from "@/lib/api/hooks";
import { queryClient } from "@/lib/api/queryClient";
import type { components, paths } from "@/lib/api/types";

type AuctionConfig = components["schemas"]["AuctionConfig"];
type AuctionSlotOverview = components["schemas"]["AuctionSlotOverview"];
type AuctionConfigInput =
  paths["/auction/configs"]["post"]["requestBody"]["content"]["application/json"];

export type AuctionSummary = {
  cityId: string;
  nicheId: string;
  marketSlots: Array<{ position: 1 | 2 | 3; currentBidCents: number }>;
  todaySpentCents: number;
  todayImpressionsPaid: number;
  todayClicks: number;
  status: "active" | "paused_by_limit" | "insufficient_balance" | "paused";
  walletBalanceCents: number;
  walletReservedCents: number;
  avgPaidPosition?: number | null;
  ctr?: number | null;
};

const auctionConfigsQuery = createQuery<AuctionConfig[], string>({
  queryKey: (companyId) => ["auction", "configs", companyId],
  queryFn: async (companyId) => {
    const response = await apiClient.get("/auction/configs", {
      params: { companyId },
    });
    return response.data;
  },
});

const auctionSummaryQuery = createQuery<
  AuctionSummary,
  { cityId: string; nicheId: string }
>({
  queryKey: (params) => ["auction", "summary", params.cityId, params.nicheId],
  queryFn: async (params) => {
    const response = await apiClient.get("/auction/summary", {
      params,
    });
    return response.data;
  },
});

const auctionSlotsQuery = createQuery<
  AuctionSlotOverview,
  { cityId: string; nicheId: string }
>({
  queryKey: (params) => ["auction", "slots", params.cityId, params.nicheId],
  queryFn: async (params) => {
    const response = await apiClient.get("/auction/slots", {
      params,
    });
    return response.data;
  },
});

const saveAuctionConfigMutation = createMutation<
  AuctionConfig,
  AuctionConfigInput
>({
  mutationKey: ["auction", "save"],
  mutationFn: async (payload) => {
    const response = await apiClient.post("/auction/configs", payload);
    return response.data;
  },
});

export const useAuctionConfigs = (companyId?: string) =>
  auctionConfigsQuery(companyId ?? "", {
    enabled: Boolean(companyId),
  });

export const useAuctionSlots = (params?: { cityId?: string; nicheId?: string }) =>
  params?.cityId && params?.nicheId
    ? auctionSlotsQuery(
        { cityId: params.cityId, nicheId: params.nicheId },
        {
          enabled: Boolean(params.cityId && params.nicheId),
        }
      )
    : auctionSlotsQuery({ cityId: "", nicheId: "" }, { enabled: false });

export const useAuctionSummary = (params?: { cityId?: string; nicheId?: string }) =>
  params?.cityId && params?.nicheId
    ? auctionSummaryQuery(
        { cityId: params.cityId, nicheId: params.nicheId },
        {
          enabled: Boolean(params.cityId && params.nicheId),
        }
      )
    : auctionSummaryQuery({ cityId: "", nicheId: "" }, { enabled: false });

export const useSaveAuctionConfig = (companyId: string) =>
  saveAuctionConfigMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["auction", "configs", companyId],
      });
      queryClient.invalidateQueries({
        queryKey: ["auction", "slots"],
        exact: false,
      });
    },
  });
