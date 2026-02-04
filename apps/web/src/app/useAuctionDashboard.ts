import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";

export type AuctionDashboardResponse = {
  moment: {
    appearancesToday: number;
    contactsToday: number;
    costPerContactToday: number;
    creditsSpentToday: number;
    currentPositionMainNiche: number | null;
  };
  period: {
    impressions: number;
    contacts: number;
    totalSpent: number;
    bestDayOfWeek: string | null;
    bestHour: string | null;
    topNiche: { nicheId: string; niche: string; total: number } | null;
  };
  niches: Array<{
    nicheId: string;
    nicheName: string;
    positionToday: number | null;
    iecToday: number;
    impressionsToday: number;
    contactsToday: number;
    activeReserve: number;
  }>;
};

export type DashboardRangeKey =
  | "today"
  | "yesterday"
  | "7d"
  | "15d"
  | "30d"
  | "90d"
  | "365d";

type DashboardParams =
  | { period: string; companyId?: string }
  | { from: string; to: string; companyId?: string };

const buildRangeParams = (rangeKey: DashboardRangeKey): DashboardParams => {
  const now = new Date();

  if (rangeKey === "today") {
    const from = new Date(now);
    from.setHours(0, 0, 0, 0);
    const to = new Date(now);
    to.setHours(23, 59, 59, 999);
    return { from: from.toISOString(), to: to.toISOString() };
  }

  if (rangeKey === "yesterday") {
    const from = new Date(now);
    from.setDate(from.getDate() - 1);
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setHours(23, 59, 59, 999);
    return { from: from.toISOString(), to: to.toISOString() };
  }

  const periodMap: Record<DashboardRangeKey, string> = {
    today: "1",
    yesterday: "2",
    "7d": "7",
    "15d": "15",
    "30d": "30",
    "90d": "90",
    "365d": "365",
  };

  return { period: periodMap[rangeKey] ?? "7" };
};

export const useAuctionDashboard = (rangeKey: DashboardRangeKey = "7d", companyId?: string) =>
  useQuery<AuctionDashboardResponse>({
    queryKey: ["auction-dashboard", rangeKey, companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const params = {
        ...buildRangeParams(rangeKey),
        ...(companyId ? { companyId } : {}),
      };
      const res = await apiClient.get<AuctionDashboardResponse>("/analytics/dashboard", {
        params,
      });
      return res.data;
    },
  });
