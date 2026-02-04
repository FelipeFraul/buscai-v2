import axios from "axios";

import { apiClient } from "@/lib/api/client";
import { createMutation, createQuery } from "@/lib/api/hooks";
import { queryClient } from "@/lib/api/queryClient";
import type { components, paths } from "@/lib/api/types";

type Subscription = components["schemas"]["Subscription"];
type SubscriptionInput =
  paths["/companies/{companyId}/product-subscription"]["post"]["requestBody"]["content"]["application/json"];

const subscriptionQuery = createQuery<Subscription | null, string>({
  queryKey: (companyId) => ["products", "subscription", companyId],
  queryFn: async (companyId) => {
    try {
      const response = await apiClient.get(
        `/companies/${companyId}/product-subscription`
      );
      return response.data;
    } catch (error) {
      if (
        axios.isAxiosError(error) &&
        (error.response?.status === 404 || error.response?.status === 400)
      ) {
        return null;
      }
      throw error;
    }
  },
});

const setSubscriptionMutation = createMutation<
  Subscription,
  { companyId: string; payload: SubscriptionInput }
>({
  mutationKey: ["products", "subscription", "save"],
  mutationFn: async ({ companyId, payload }) => {
    const response = await apiClient.post(
      `/companies/${companyId}/product-subscription`,
      payload
    );
    return response.data;
  },
});

export const useProductSubscription = (companyId?: string) =>
  subscriptionQuery(companyId ?? "", {
    enabled: Boolean(companyId),
  });

export const useSetProductSubscription = (companyId: string) =>
  setSubscriptionMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["products", "subscription", companyId],
      });
      queryClient.invalidateQueries({
        queryKey: ["products", "offers", companyId],
      });
    },
  });
