import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";

export type WhatsappAbuseAlert = {
  phone: string;
  nicheId?: string | null;
  nicheLabel?: string | null;
  count: number;
  firstAt: string;
  lastAt: string;
  blockedUntil?: string | null;
  blockReason?: string | null;
};

export type WhatsappBlockEntry = {
  phone: string;
  reason: string;
  message: string | null;
  blockedUntil: string;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
};

export type WhatsappAbuseAlertsResponse = {
  sameNiche: WhatsappAbuseAlert[];
  distinctNiches: WhatsappAbuseAlert[];
  blocks: WhatsappBlockEntry[];
};

export const useWhatsappAbuseAlerts = () =>
  useQuery({
    queryKey: ["admin", "whatsapp", "alerts"],
    queryFn: async () => {
      const response = await apiClient.get("/admin/whatsapp/alerts");
      return response.data as WhatsappAbuseAlertsResponse;
    },
    refetchInterval: 30_000,
  });

export const useBlockWhatsappNumber = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      phone: string;
      durationHours?: number;
      reason?: string;
      message?: string;
    }) => apiClient.post("/admin/whatsapp/blocks", payload).then((response) => response.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "whatsapp", "alerts"] });
    },
  });
};

export const useUnblockWhatsappNumber = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (phone: string) =>
      apiClient.post(`/admin/whatsapp/blocks/${phone}/unblock`).then((response) => response.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "whatsapp", "alerts"] });
    },
  });
};
