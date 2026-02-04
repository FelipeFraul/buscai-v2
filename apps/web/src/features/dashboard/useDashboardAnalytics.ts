import { useQuery } from "@tanstack/react-query";

import { useMeCompany } from "@/app/useMeCompany";

import { fetchDashboardAnalytics } from "./api";
import { type DashboardAnalytics, type ContactOrigins } from "./types";

const DEFAULT_DATA: DashboardAnalytics = {
  searches: {
    total: 0,
    volumeByDay: [],
    peakHours: [],
    byNiche: [],
    byProduct: [],
  },
  appearances: {
    total: 0,
    auction: { pos1: 0, pos2: 0, pos3: 0 },
    organic: { pos4: 0, pos5: 0 },
    offered: 0,
    byProduct: [],
  },
  actions: {
    totalClicks: 0,
    calls: 0,
    whatsapp: 0,
    ctr: 0,
    clicksByHour: [],
  },
  costs: {
    totalSpent: 0,
    costPerAppearance: 0,
    costPerClick: 0,
  },
  performance: {
    byNiche: [],
    byProduct: [],
    byHour: [],
    byDay: [],
  },
  origins: { calls: 0, whatsapp: 0, web: 0 },
};

export const useDashboardAnalytics = () => {
  const { data: meCompany } = useMeCompany();
  const companyId = meCompany?.company?.id;
  const query = useQuery({
    queryKey: ["analytics", "dashboard", companyId ?? "none"],
    enabled: Boolean(companyId),
    queryFn: () => fetchDashboardAnalytics(companyId),
  });

  const withOrigins = (data: DashboardAnalytics): DashboardAnalytics => {
    const calls = data.actions?.calls ?? 0;
    const whatsapp = data.actions?.whatsapp ?? 0;
    const total = data.actions?.totalClicks ?? 0;
    const web = Math.max(total - calls - whatsapp, 0);

    const origins: ContactOrigins = { calls, whatsapp, web };
    return { ...data, origins };
  };

  return {
    data: query.data ? withOrigins(query.data) : withOrigins(DEFAULT_DATA),
    loading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
};
