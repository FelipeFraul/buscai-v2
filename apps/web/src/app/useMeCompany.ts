import { useQuery } from "@tanstack/react-query";
import { AxiosError } from "axios";

import { apiClient } from "@/lib/api/client";

export type MeCompanyResponse = {
  company: {
    id: string;
    tradeName: string;
    legalName?: string;
    city?: { id: string; name: string; state: string };
    niches?: Array<{ id: string; label: string; slug: string }>;
    status?: string;
    channels?: {
      address?: string | null;
      phone?: string | null;
      whatsapp?: string | null;
      openingHours?: string | null;
    };
    createdAt?: string;
  };
  billing?: { wallet?: { balanceCents?: number; reservedCents?: number } };
  products?: { activeOffers?: number };
  auction?: { activeConfigs?: number };
};

export const useMeCompany = (companyId?: string) =>
  useQuery<MeCompanyResponse | null>({
    queryKey: ["me-company", companyId ?? "default"],
    queryFn: async () => {
      try {
        const res = await apiClient.get<MeCompanyResponse>("/me/company", {
          params: companyId ? { companyId } : undefined,
        });
        return res.data;
      } catch (error) {
        if (error instanceof AxiosError && error.response?.status === 400) {
          return null;
        }
        throw error;
      }
    },
    retry: false,
    refetchOnWindowFocus: true,
    refetchInterval: 10000,
  });
