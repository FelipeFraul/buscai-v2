import { apiClient } from "@/lib/api/client";
import { createMutation } from "@/lib/api/hooks";
import type { operations } from "@/lib/api/types";

type SearchAnalyticsParams =
  NonNullable<operations["getSearchAnalytics"]["parameters"]["query"]>;
type SearchAnalyticsResponse =
  operations["getSearchAnalytics"]["responses"]["200"]["content"]["application/json"];

const analyticsMutation = createMutation<
  SearchAnalyticsResponse,
  SearchAnalyticsParams
>({
  mutationKey: ["search", "analytics"],
  mutationFn: async (params) => {
    const response = await apiClient.get("/analytics/searches", { params });
    return response.data;
  },
});

export const useSearchAnalytics = () => analyticsMutation();
