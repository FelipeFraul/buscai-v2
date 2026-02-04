import { apiClient } from "@/lib/api/client";
import { createMutation, createQuery } from "@/lib/api/hooks";

export type AdminCompany = {
  id: string;
  name: string;
  cityId: string;
  nicheId: string | null;
  addressLine: string;
  phoneE164: string | null;
  whatsappE164: string | null;
  website: string | null;
  lat: string | null;
  lng: string | null;
  status: "draft" | "pending" | "active" | "suspended";
  participatesInAuction?: boolean;
  hasWhatsapp?: boolean;
  origin: "serpapi" | "manual" | "claimed";
  qualityScore: number;
  createdAt?: string;
  updatedAt?: string;
};

export type AdminCompaniesResponse = {
  items: AdminCompany[];
  total: number;
  page: number;
  limit: number;
};

export type AdminCompanyPayload = {
  name: string;
  cityId: string;
  nicheId: string;
  addressLine: string;
  phoneE164?: string;
  whatsappE164?: string;
  website?: string;
  lat?: number;
  lng?: number;
  status?: "draft" | "pending" | "active" | "suspended";
  origin?: "serpapi" | "manual" | "claimed";
  qualityScore?: number;
  force?: boolean;
};

export type AdminCompaniesQuery = {
  cityId?: string;
  nicheId?: string;
  status?: string;
  q?: string;
  page?: number;
  limit?: number;
};

export const useAdminCompanies = (query: AdminCompaniesQuery) =>
  createQuery<AdminCompaniesResponse, AdminCompaniesQuery>({
    queryKey: (variables) => ["admin-companies", variables],
    queryFn: async (variables) => {
      const response = await apiClient.get("/admin/companies", { params: variables });
      return response.data as AdminCompaniesResponse;
    },
  })(query);

export const useAdminCompany = (companyId: string | null) =>
  createQuery<AdminCompany, { companyId: string }>({
    queryKey: (variables) => ["admin-company", variables.companyId],
    queryFn: async ({ companyId }) => {
      const response = await apiClient.get(`/admin/companies/${companyId}`);
      return response.data as AdminCompany;
    },
  })(
    { companyId: companyId ?? "" },
    {
      enabled: Boolean(companyId),
    }
  );

export const useCreateAdminCompany = () =>
  createMutation<AdminCompany, AdminCompanyPayload>({
    mutationFn: (payload) =>
      apiClient.post("/admin/companies", payload).then((response) => response.data),
  })();

export const useUpdateAdminCompany = () =>
  createMutation<AdminCompany, { companyId: string; payload: Partial<AdminCompanyPayload> }>({
    mutationFn: (payload) =>
      apiClient
        .patch(`/admin/companies/${payload.companyId}`, payload.payload)
        .then((response) => response.data),
  })();

export const useSetAdminCompanyStatus = () =>
  createMutation<{ success: true }, { companyId: string; status: AdminCompany["status"] }>({
    mutationFn: (payload) =>
      apiClient
        .patch(`/admin/companies/${payload.companyId}/status`, { status: payload.status })
        .then((response) => response.data),
  })();
