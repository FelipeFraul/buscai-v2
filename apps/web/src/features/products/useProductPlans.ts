import { apiClient } from "@/lib/api/client";
import { createQuery } from "@/lib/api/hooks";
import type { components } from "@/lib/api/types";

type ProductPlan = components["schemas"]["ProductPlan"];

const productPlansQuery = createQuery<ProductPlan[]>({
  queryKey: ["products", "plans"],
  queryFn: async () => {
    const response = await apiClient.get("/product-plans");
    return response.data;
  },
});

export const useProductPlans = () =>
  productPlansQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });
