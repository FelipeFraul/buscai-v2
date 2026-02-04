export type SearchVolumeByDay = { date: string; total: number };
export type SearchPeakHour = { hour: number; total: number };
export type SearchByNiche = { niche: string; total: number };
export type SearchByProduct = { product: string; total: number };

export type AppearancesByProduct = { product: string; total: number };

export type ClicksByHour = { hour: number; total: number };

export type PerformanceByNiche = { niche: string; value: number };
export type PerformanceByProduct = { product: string; value: number };
export type PerformanceByHour = { hour: number; value: number };
export type PerformanceByDay = { date: string; value: number };

export interface ContactOrigins {
  calls: number;
  whatsapp: number;
  web: number;
}

export interface DashboardAnalytics {
  searches: {
    total: number;
    volumeByDay: SearchVolumeByDay[];
    peakHours: SearchPeakHour[];
    byNiche: SearchByNiche[];
    byProduct: SearchByProduct[];
  };
  appearances: {
    total: number;
    auction: { pos1: number; pos2: number; pos3: number };
    organic: { pos4: number; pos5: number };
    offered: number;
    byProduct: AppearancesByProduct[];
  };
  actions: {
    totalClicks: number;
    calls: number;
    whatsapp: number;
    ctr: number;
    clicksByHour: ClicksByHour[];
  };
  costs: {
    totalSpent: number;
    costPerAppearance: number;
    costPerClick: number;
  };
  performance: {
    byNiche: PerformanceByNiche[];
    byProduct: PerformanceByProduct[];
    byHour: PerformanceByHour[];
    byDay: PerformanceByDay[];
  };
  origins: ContactOrigins;
}
