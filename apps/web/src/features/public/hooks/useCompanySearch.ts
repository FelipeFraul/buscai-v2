import { apiClient } from "@/lib/api/client";
import { createMutation } from "@/lib/api/hooks";
import type { paths } from "@/lib/api/types";

type CompanySearchRequest =
  paths["/search"]["post"]["requestBody"]["content"]["application/json"];
type CompanySearchResponse =
  paths["/search"]["post"]["responses"]["200"]["content"]["application/json"];

const companySearchMutation = createMutation<
  CompanySearchResponse,
  CompanySearchRequest
>({
  mutationKey: ["public", "search", "companies"],
  mutationFn: async (payload) => {
    const response = await apiClient.post("/search", payload);
    return response.data;
  },
});

export const useCompanySearch = () => companySearchMutation();
