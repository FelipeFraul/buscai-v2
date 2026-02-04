import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";

export type OfferedByConfigRow = {
  config: {
    id: string;
    companyId: string;
    cityId?: string | null;
    nicheId?: string | null;
    text?: string | null;
    imageUrl?: string | null;
    website?: string | null;
    promotionsUrl?: string | null;
    phoneE164?: string | null;
    whatsappE164?: string | null;
    isActive: boolean;
    updatedAt?: string | null;
  };
  company?: { id: string; tradeName?: string | null; legalName?: string | null };
  city?: { id: string; name: string; state: string } | null;
  niche?: { id: string; label: string } | null;
};

export type OfferedByConfigPayload = {
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
};

export type OfferedByDashboard = {
  config: OfferedByConfigRow;
  totals: {
    impressions: number;
    clicks: number;
    clicksWhatsapp: number;
    clicksCall: number;
    clicksSite: number;
    clicksPromotions: number;
  };
  byCity: Array<{ cityId: string | null; city: string; total: number }>;
  byNiche: Array<{ nicheId: string | null; niche: string; total: number }>;
  byDay: Array<{ day: string; total: number }>;
  byHour: Array<{ hour: number; total: number }>;
  bySearchType: Array<{ searchType: string; total: number }>;
};

export type CompanyLookupItem = {
  id: string;
  tradeName: string;
  status?: string;
  city?: { id: string; name: string; state: string };
};

export const useOfferedByConfigs = (filters?: {
  companyId?: string;
  cityId?: string;
  nicheId?: string;
  isActive?: boolean;
}) =>
  useQuery({
    queryKey: ["admin", "offered-by", filters],
    queryFn: async () => {
      const response = await apiClient.get("/admin/offered-by", { params: filters });
      return response.data as OfferedByConfigRow[];
    },
  });

export const useCreateOfferedByConfig = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: OfferedByConfigPayload) =>
      apiClient.post("/admin/offered-by", payload).then((response) => response.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "offered-by"] });
    },
  });
};

export const useUpdateOfferedByConfig = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { id: string; data: OfferedByConfigPayload }) =>
      apiClient.patch(`/admin/offered-by/${payload.id}`, payload.data).then((response) => response.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "offered-by"] });
    },
  });
};

export const useToggleOfferedByConfig = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { id: string; isActive: boolean }) => {
      const action = payload.isActive ? "enable" : "disable";
      return apiClient.post(`/admin/offered-by/${payload.id}/${action}`).then((response) => response.data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "offered-by"] });
    },
  });
};

export const useCompanyLookup = (query: string) =>
  useQuery({
    queryKey: ["companies", "search", query],
    enabled: query.trim().length >= 3,
    queryFn: async () => {
      const response = await apiClient.get("/companies/search", {
        params: { q: query.trim(), limit: 6 },
      });
      return response.data as { items: CompanyLookupItem[] };
    },
  });

export const useOfferedByDashboard = (configId: string, filters?: { from?: string; to?: string }) =>
  useQuery({
    queryKey: ["admin", "offered-by", "dashboard", configId, filters],
    enabled: Boolean(configId),
    queryFn: async () => {
      const response = await apiClient.get(`/admin/offered-by/${configId}/dashboard`, {
        params: filters,
      });
      return response.data as OfferedByDashboard;
    },
  });
