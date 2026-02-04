import { apiClient } from "@/lib/api/client";
import { createMutation, createQuery } from "@/lib/api/hooks";
import { queryClient } from "@/lib/api/queryClient";
import type { components, paths } from "@/lib/api/types";

type ProductOffer = components["schemas"]["ProductOffer"];

type ProductOffersResponse =
  paths["/companies/{companyId}/product-offers"]["get"]["responses"]["200"]["content"]["application/json"];
type ProductOfferCreateInput =
  paths["/companies/{companyId}/product-offers"]["post"]["requestBody"]["content"]["application/json"];
type ProductOfferUpdateInput =
  paths["/companies/{companyId}/product-offers/{offerId}"]["patch"]["requestBody"]["content"]["application/json"];

type SaveOfferVariables =
  | { companyId: string; data: ProductOfferCreateInput; offerId?: undefined }
  | { companyId: string; offerId: string; data: ProductOfferUpdateInput };

const productOffersQuery = createQuery<ProductOffersResponse, { companyId: string }>(
  {
    queryKey: (params) => ["products", "offers", params.companyId],
    queryFn: async ({ companyId }) => {
      const response = await apiClient.get(
        `/companies/${companyId}/product-offers`
      );
      return response.data;
    },
  }
);

const saveProductOfferMutation = createMutation<ProductOffer, SaveOfferVariables>({
  mutationKey: ["products", "offers", "save"],
  mutationFn: async (variables) => {
    if (variables.offerId) {
      const response = await apiClient.patch(
        `/companies/${variables.companyId}/product-offers/${variables.offerId}`,
        variables.data
      );
      return response.data;
    }

    const response = await apiClient.post(
      `/companies/${variables.companyId}/product-offers`,
      variables.data
    );
    return response.data;
  },
});

export const useProductOffers = (companyId?: string) =>
  productOffersQuery(
    { companyId: companyId ?? "" },
    {
      enabled: Boolean(companyId),
    }
  );

export const useSaveProductOffer = () =>
  saveProductOfferMutation({
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["products", "offers", variables.companyId],
      });
    },
  });
