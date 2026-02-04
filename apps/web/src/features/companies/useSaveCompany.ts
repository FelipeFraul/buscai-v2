import { apiClient } from "@/lib/api/client";
import { createMutation } from "@/lib/api/hooks";
import { queryClient } from "@/lib/api/queryClient";
import type { components, paths } from "@/lib/api/types";

type CompanyCreateInput =
  paths["/companies"]["post"]["requestBody"]["content"]["application/json"];
type CompanyUpdateInput =
  paths["/companies/{companyId}"]["patch"]["requestBody"]["content"]["application/json"];
type Company = components["schemas"]["Company"];

const saveCompanyMutation = createMutation<
  Company,
  { companyId?: string; payload: CompanyCreateInput | CompanyUpdateInput }
>({
  mutationKey: ["companies", "save"],
  mutationFn: async ({ companyId, payload }) => {
    if (companyId) {
      const response = await apiClient.patch(`/companies/${companyId}`, payload);
      return response.data;
    }

    const response = await apiClient.post("/companies", payload);
    return response.data;
  },
});

export const useSaveCompany = () =>
  saveCompanyMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
    },
  });
