import { apiClient } from "@/lib/api/client";
import { createMutation, createQuery } from "@/lib/api/hooks";
import { queryClient } from "@/lib/api/queryClient";
import type { QueryKey, UseQueryOptions } from "@tanstack/react-query";

export type NotificationCategory =
  | "financial"
  | "visibility"
  | "subscription"
  | "contacts"
  | "system";

export type NotificationSeverity = "low" | "medium" | "high";
export type NotificationKind = "event" | "summary" | "alert";

export type NotificationItem = {
  id: string;
  companyId: string;
  category: NotificationCategory;
  severity: NotificationSeverity;
  kind: NotificationKind;
  title: string;
  message?: string | null;
  reason?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  metadata?: unknown;
  readAt?: string | null;
  createdAt?: string;
};

export type NotificationsResponse = {
  items: NotificationItem[];
  nextOffset?: number | null;
};

export type NotificationsQuery = {
  limit?: number;
  offset?: number;
  category?: NotificationCategory;
  severity?: NotificationSeverity;
  kind?: NotificationKind;
  unread?: boolean;
  companyId?: string;
};

export type NotificationPreferences = {
  companyId: string;
  panelEnabled: boolean;
  financialEnabled: boolean;
  visibilityEnabled: boolean;
  subscriptionEnabled: boolean;
  contactsEnabled: boolean;
  systemEnabled: boolean;
  frequency: "real_time" | "daily" | "weekly" | "never";
  whatsappEnabled: boolean;
  emailEnabled: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type NotificationPreferencesUpdate = Partial<
  Omit<NotificationPreferences, "companyId" | "createdAt" | "updatedAt">
>;

const notificationsQuery = createQuery<NotificationsResponse, NotificationsQuery>({
  queryKey: (variables) => ["notifications", variables.companyId ?? "", variables],
  queryFn: async (variables) => {
    const response = await apiClient.get("/notifications", { params: variables });
    return response.data as NotificationsResponse;
  },
});

type NotificationsQueryOptions = Omit<
  UseQueryOptions<NotificationsResponse, unknown, NotificationsResponse, QueryKey>,
  "queryKey" | "queryFn"
>;

export const useNotifications = (query: NotificationsQuery, options?: NotificationsQueryOptions) =>
  notificationsQuery(query, options);

const notificationPreferencesQuery = createQuery<NotificationPreferences, { companyId: string }>({
  queryKey: (variables) => ["notification-preferences", variables.companyId],
  queryFn: async (variables) => {
    const response = await apiClient.get("/notification-preferences", {
      params: { companyId: variables.companyId },
    });
    return response.data as NotificationPreferences;
  },
});

type NotificationPreferencesOptions = Omit<
  UseQueryOptions<NotificationPreferences, unknown, NotificationPreferences, QueryKey>,
  "queryKey" | "queryFn"
>;

export const useNotificationPreferences = (
  companyId?: string,
  options?: NotificationPreferencesOptions
) =>
  notificationPreferencesQuery(
    { companyId: companyId ?? "" },
    { enabled: Boolean(companyId), ...options }
  );

export const useUpdateNotificationPreferences = () =>
  createMutation<NotificationPreferences, NotificationPreferencesUpdate>({
    mutationKey: ["notification-preferences", "update"],
    mutationFn: async (payload) => {
      const response = await apiClient.put("/notification-preferences", payload);
      return response.data as NotificationPreferences;
    },
  })({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-preferences"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

export const useMarkNotificationsRead = () =>
  createMutation<{ updated: number }, { ids: string[] }>({
    mutationKey: ["notifications", "mark-read"],
    mutationFn: async (payload) => {
      const response = await apiClient.post("/notifications/mark-read", payload);
      return response.data as { updated: number };
    },
  })({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
