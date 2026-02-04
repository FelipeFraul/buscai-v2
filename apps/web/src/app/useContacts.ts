import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";

export type ContactRecord = {
  id: string;
  companyId: string;
  channel: "whatsapp" | "call";
  phone: string;
  name?: string | null;
  nicheId?: string | null;
  classification?: "curious" | "new_client" | "recurring" | "quote" | null;
  createdAt: string;
};

type ContactResponse = {
  items: ContactRecord[];
  total: number;
  page: number;
  pageSize: number;
};

export const useContacts = (
  companyId?: string,
  filters?: { classification?: string; limit?: number }
) =>
  useQuery<ContactResponse>({
    queryKey: ["contacts", companyId, filters?.classification, filters?.limit],
    enabled: Boolean(companyId),
    queryFn: async () => {
      if (!companyId) {
        throw new Error("companyId_required");
      }

      const res = await apiClient.get<ContactResponse>(
        `/companies/${companyId}/contacts`,
        {
          params: {
            page: 1,
            pageSize: filters?.limit ?? 20,
            ...(filters?.classification ? { classification: filters.classification } : {}),
          },
        }
      );
      return res.data;
    },
  });
