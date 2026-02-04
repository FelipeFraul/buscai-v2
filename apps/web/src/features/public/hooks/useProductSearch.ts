import { apiClient } from "@/lib/api/client";
import { createMutation } from "@/lib/api/hooks";
import type { paths } from "@/lib/api/types";

type ProductSearchRequest =
  paths["/search/products"]["post"]["requestBody"]["content"]["application/json"];
type ProductSearchResponse =
  paths["/search/products"]["post"]["responses"]["200"]["content"]["application/json"];

const productSearchMutation = createMutation<
  ProductSearchResponse,
  ProductSearchRequest
>({
  mutationKey: ["public", "search", "products"],
  mutationFn: async (payload) => {
    const response = await apiClient.post("/search/products", payload);
    return response.data;
  },
});

export const useProductSearch = () => productSearchMutation();
