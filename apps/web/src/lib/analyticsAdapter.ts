import type { DashboardAnalytics } from "@/features/dashboard/types";

export type LegacyDashboardResponse = {
  totals: {
    impressions: number;
    contacts: number;
    totalCostCents: number;
    costPerContactCents: number;
  };
  byHour: Array<{ hour: number; impressions: number; contacts: number }>;
  byNiche: Array<{
    nicheId: string;
    label?: string;
    impressions?: number;
    contacts?: number;
  }>;
};

const toNumber = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toCents = (value: unknown): number => Math.round(toNumber(value));

export const adaptDashboardToLegacyShape = (
  payload: DashboardAnalytics
): LegacyDashboardResponse => {
  const impressionsTotal = toNumber(payload.appearances?.total);

  const totalClicks = toNumber(
    payload.actions?.totalClicks ??
      (toNumber(payload.actions?.calls) + toNumber(payload.actions?.whatsapp))
  );

  const totalSpent = toNumber(payload.costs?.totalSpent);
  const costPerClick = toNumber(payload.costs?.costPerClick);
  const derivedCostPerClick = totalClicks > 0 ? totalSpent / totalClicks : 0;

  const impressionsByHour = new Map<number, number>();
  const contactsByHour = new Map<number, number>();

  payload.searches?.peakHours?.forEach((item) => {
    impressionsByHour.set(toNumber(item.hour), toNumber(item.total));
  });

  payload.actions?.clicksByHour?.forEach((item) => {
    contactsByHour.set(toNumber(item.hour), toNumber(item.total));
  });

  payload.performance?.byHour?.forEach((item) => {
    const hour = toNumber(item.hour);
    if (!impressionsByHour.has(hour)) {
      const rawImpressions = (item as any).appearances ?? (item as any).impressions;
      if (rawImpressions !== undefined && rawImpressions !== null) {
        impressionsByHour.set(hour, toNumber(rawImpressions));
      }
    }
    if (!contactsByHour.has(hour)) {
      const rawContacts = (item as any).clicks ?? (item as any).contacts ?? (item as any).value;
      if (rawContacts !== undefined && rawContacts !== null) {
        contactsByHour.set(hour, toNumber(rawContacts));
      }
    }
  });

  const byHour = Array.from(
    new Set([...impressionsByHour.keys(), ...contactsByHour.keys()])
  )
    .sort((a, b) => a - b)
    .map((hour) => ({
      hour,
      impressions: impressionsByHour.get(hour) ?? 0,
      contacts: contactsByHour.get(hour) ?? 0,
    }));

  const impressionsByNiche = new Map<string, { label: string; impressions: number }>();
  const contactsByNiche = new Map<string, number>();

  payload.searches?.byNiche?.forEach((item, index) => {
    const key = (item as any).nicheId ?? item.niche ?? `niche-${index}`;
    impressionsByNiche.set(key, {
      label: item.niche ?? key,
      impressions: toNumber(item.total),
    });
  });

  payload.performance?.byNiche?.forEach((item, index) => {
    const key = (item as any).nicheId ?? item.niche ?? `niche-${index}`;
    if (!impressionsByNiche.has(key)) {
      const impressions = toNumber(
        (item as any).appearances ?? (item as any).impressions
      );
      impressionsByNiche.set(key, {
        label: item.niche ?? key,
        impressions,
      });
    }

    const rawContacts =
      (item as any).clicks ?? (item as any).contacts ?? (item as any).value;
    if (rawContacts !== undefined && rawContacts !== null) {
      contactsByNiche.set(key, toNumber(rawContacts));
    }
  });

  const byNiche = Array.from(
    new Set([...impressionsByNiche.keys(), ...contactsByNiche.keys()])
  ).map((key) => ({
    nicheId: key,
    label: impressionsByNiche.get(key)?.label ?? key,
    impressions: impressionsByNiche.get(key)?.impressions ?? 0,
    contacts: contactsByNiche.get(key) ?? 0,
  }));

  return {
    totals: {
      impressions: impressionsTotal,
      contacts: totalClicks,
      totalCostCents: toCents(totalSpent),
      costPerContactCents: toCents(costPerClick > 0 ? costPerClick : derivedCostPerClick),
    },
    byHour,
    byNiche,
  };
};
