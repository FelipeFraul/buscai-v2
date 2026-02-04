import { apiClient } from "@/lib/api/client";

import { type DashboardAnalytics } from "./types";

const numberOrZero = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isNaN(parsed) ? 0 : parsed;
};

export async function fetchDashboardAnalytics(
  params?: string | {
    companyId?: string;
    nicheId?: string;
    cityId?: string;
    period?: string;
    from?: string;
    to?: string;
  }
): Promise<DashboardAnalytics> {
  const query =
    typeof params === "string"
      ? { companyId: params }
      : params;
  const response = await apiClient.get("/analytics/dashboard", {
    params: query,
  });
  const data = response.data ?? {};

  const searches = data.searches ?? {};
  const appearances = data.appearances ?? {};
  const actions = data.actions ?? {};
  const costs = data.costs ?? {};
  const performance = data.performance ?? {};
  const origins = data.origins ?? {};

  return {
    searches: {
      total: numberOrZero(searches.total),
      volumeByDay: Array.isArray(searches.volumeByDay)
        ? searches.volumeByDay.map((item: any) => ({
            date: item?.date ?? "",
            total: numberOrZero(item?.total),
          }))
        : [],
      peakHours: Array.isArray(searches.peakHours)
        ? searches.peakHours.map((item: any) => ({
            hour: numberOrZero(item?.hour),
            total: numberOrZero(item?.total),
          }))
        : [],
      byNiche: Array.isArray(searches.byNiche)
        ? searches.byNiche.map((item: any) => ({
            niche: item?.niche ?? "",
            total: numberOrZero(item?.total),
          }))
        : [],
      byProduct: Array.isArray(searches.byProduct)
        ? searches.byProduct.map((item: any) => ({
            product: item?.product ?? "",
            total: numberOrZero(item?.total),
          }))
        : [],
    },
    appearances: {
      total: numberOrZero(appearances.total),
      auction: {
        pos1: numberOrZero(appearances?.auction?.pos1),
        pos2: numberOrZero(appearances?.auction?.pos2),
        pos3: numberOrZero(appearances?.auction?.pos3),
      },
      organic: {
        pos4: numberOrZero(appearances?.organic?.pos4),
        pos5: numberOrZero(appearances?.organic?.pos5),
      },
      offered: numberOrZero(appearances.offered),
      byProduct: Array.isArray(appearances.byProduct)
        ? appearances.byProduct.map((item: any) => ({
            product: item?.product ?? "",
            total: numberOrZero(item?.total),
          }))
        : [],
    },
    actions: {
      totalClicks: numberOrZero(actions.totalClicks),
      calls: numberOrZero(actions.calls),
      whatsapp: numberOrZero(actions.whatsapp),
      ctr: numberOrZero(actions.ctr),
      clicksByHour: Array.isArray(actions.clicksByHour)
        ? actions.clicksByHour.map((item: any) => ({
            hour: numberOrZero(item?.hour),
            total: numberOrZero(item?.total),
          }))
        : [],
    },
    costs: {
      totalSpent: numberOrZero(costs.totalSpent),
      costPerAppearance: numberOrZero(costs.costPerAppearance),
      costPerClick: numberOrZero(costs.costPerClick),
    },
    performance: {
      byNiche: Array.isArray(performance.byNiche)
        ? performance.byNiche.map((item: any) => ({
            niche: item?.niche ?? "",
            value: numberOrZero(item?.value ?? item?.ctr),
          }))
        : [],
      byProduct: Array.isArray(performance.byProduct)
        ? performance.byProduct.map((item: any) => ({
            product: item?.product ?? "",
            value: numberOrZero(item?.value ?? item?.ctr),
          }))
        : [],
      byHour: Array.isArray(performance.byHour)
        ? performance.byHour.map((item: any) => ({
            hour: numberOrZero(item?.hour),
            value: numberOrZero(item?.value ?? item?.ctr),
          }))
        : [],
      byDay: Array.isArray(performance.byDay)
        ? performance.byDay.map((item: any) => ({
            date: item?.date ?? "",
            value: numberOrZero(item?.value ?? item?.ctr),
          }))
        : [],
    },
    origins: {
      calls: numberOrZero(origins.calls),
      whatsapp: numberOrZero(origins.whatsapp),
      web: numberOrZero(origins.web),
    },
  };
}
