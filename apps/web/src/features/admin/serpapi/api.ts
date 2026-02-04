import { apiClient } from "@/lib/api/client";
import { createMutation, createQuery } from "@/lib/api/hooks";

export type SerpapiRunSummary = {
  id: string;
  status: string;
  initiatedByUserId?: string | null;
  cityId: string | null;
  nicheId: string | null;
  query: string | null;
  paramsJson?: string | null;
  dryRun?: boolean;
  found: number;
  inserted: number;
  updated: number;
  conflicts: number;
  errors: number;
  deduped?: number;
  createdAt: string;
  finishedAt: string | null;
};

export type SerpapiNicheSummary = {
  nicheId: string;
  nicheName: string;
  companiesCount: number;
};

export type SerpapiNicheCompany = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  whatsapp: string | null;
  hasWhatsapp: boolean;
  source: string;
  createdAt: string;
};

export type SerpapiNicheCompaniesResponse = {
  niche: { id: string; name: string };
  companies: SerpapiNicheCompany[];
};

export type SerpapiAllTimeMetrics = {
  totalCompanies: number;
  totalNiches: number;
  totalCities: number;
  topCity: {
    cityId: string;
    cityName: string;
    cityState: string | null;
    companiesCount: number;
  } | null;
  topNiche: {
    nicheId: string;
    nicheName: string;
    companiesCount: number;
  } | null;
};

export type SerpapiCompanyDetail = {
  id: string;
  name: string;
  address: string;
  phone: string | null;
  whatsapp: string | null;
  participatesInAuction: boolean;
  hasWhatsapp: boolean;
  origin?: string | null;
};

export type SerpapiRecordItem = {
  id: string;
  status: string;
  companyId: string | null;
  dedupeKey: string | null;
  reason: string | null;
  rawPreview: string | null;
};

export type SerpapiDedupeHit = {
  id: string;
  name: string;
  addressLine: string | null;
  phoneE164: string | null;
  whatsappE164: string | null;
  website: string | null;
  status: string;
  cityId: string;
};

export type SerpapiRunDetail = {
  run: SerpapiRunSummary;
  records: {
    items: SerpapiRecordItem[];
    total: number;
  };
};

export type SerpapiRunRecordsResponse = {
  items: SerpapiRecordItem[];
  total: number;
  limit: number;
  offset: number;
};

export type SerpapiApiKeyStatus = {
  isConfigured: boolean;
  updatedAt: string | null;
  activeApiKeyId?: string | null;
};

export type SerpapiApiKeyItem = {
  id: string;
  label: string | null;
  masked: string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
  isActive: boolean;
};

export type StartImportPayload = {
  cityId: string;
  nicheId: string;
  query?: string;
  limit?: number;
  dryRun?: boolean;
};

export type ManualImportPayload = {
  rows: Array<Record<string, unknown>>;
  mapping: {
    name?: string;
    phone?: string;
    address?: string;
    city?: string;
    niche?: string;
    source?: string;
    instagram?: string;
    site?: string;
    url?: string;
  };
  fixedCityId?: string | null;
  fixedNicheId?: string | null;
  options?: {
    ignoreDuplicates?: boolean;
    updateExisting?: boolean;
    dryRun?: boolean;
  };
};

type ResolveConflictPayload = {
  runId: string;
  recordId: string;
  action: "link_existing" | "create_new" | "ignore";
  companyId?: string;
};

export type PublishSerpapiRecordPayload = {
  runId: string;
  recordId: string;
  statusAfter?: "pending" | "active";
  force?: boolean;
  targetCompanyId?: string;
};

export type PublishSerpapiRecordResponse = {
  companyId: string;
  mode: "created" | "linked";
};

export const startImportMutation = createMutation<{ runId: string }, StartImportPayload>({
  mutationFn: (payload) => apiClient.post("/admin/serpapi/import", payload).then((response) => response.data),
});

export const startManualImportMutation = createMutation<{ runId: string }, ManualImportPayload>({
  mutationFn: (payload) =>
    apiClient.post("/admin/serpapi/import-manual", payload).then((response) => response.data),
});

export const invalidateRunMutation = createMutation<{ success: true }, { runId: string }>({
  mutationFn: ({ runId }) =>
    apiClient.post(`/admin/serpapi/runs/${runId}/invalidate`).then((response) => response.data),
});

export const useRunsQuery = (
  page = 1,
  pageSize = 10,
  options?: { excludeTests?: boolean }
) =>
  createQuery<
    SerpapiRunSummary[],
    { page: number; pageSize: number; excludeTests?: boolean }
  >({
    queryKey: (variables) => [
      "serpapi",
      "runs",
      variables.page,
      variables.pageSize,
      variables.excludeTests ?? false,
    ],
    queryFn: async ({ page, pageSize, excludeTests }) => {
      const response = await apiClient.get("/admin/serpapi/runs", {
        params: { page, pageSize, excludeTests },
      });
      return response.data as SerpapiRunSummary[];
    },
  })({ page, pageSize, excludeTests: options?.excludeTests });

export const useRunQuery = (runId: string | null) =>
  createQuery<SerpapiRunDetail, { runId: string }>({
    queryKey: (variables) => ["serpapi", "run", variables.runId],
    queryFn: async ({ runId }) => {
      if (!runId) {
        return Promise.resolve(null as unknown as SerpapiRunDetail);
      }
      const response = await apiClient.get(`/admin/serpapi/runs/${runId}`);
      return response.data as SerpapiRunDetail;
    },
  })(
    { runId: runId ?? "" },
    {
      enabled: Boolean(runId),
    }
  );

export const useRunRecordsQuery = (
  runId: string | null,
  params: { status?: string; limit: number; offset: number }
) =>
  createQuery<SerpapiRunRecordsResponse, { runId: string; status?: string; limit: number; offset: number }>({
    queryKey: (variables) => [
      "serpapi",
      "run-records",
      variables.runId,
      variables.status,
      variables.limit,
      variables.offset,
    ],
    queryFn: async ({ runId, status, limit, offset }) => {
      if (!runId) {
        return Promise.resolve(null as unknown as SerpapiRunRecordsResponse);
      }
      const response = await apiClient.get(`/admin/serpapi/runs/${runId}/records`, {
        params: { status, limit, offset },
      });
      return response.data as SerpapiRunRecordsResponse;
    },
  })(
    { runId: runId ?? "", status: params.status, limit: params.limit, offset: params.offset },
    {
      enabled: Boolean(runId),
    }
  );

export const useRunDetailQuery = (runId: string | null, status?: string, page = 1, pageSize = 10) =>
  createQuery<SerpapiRunDetail, { runId: string; status?: string; page: number; pageSize: number }>({
    queryKey: (variables) => ["serpapi", "run", variables.runId, variables.status, variables.page, variables.pageSize],
    queryFn: async ({ runId, status, page, pageSize }) => {
      if (!runId) {
        return Promise.resolve(null as unknown as SerpapiRunDetail);
      }
      const response = await apiClient.get(`/admin/serpapi/runs/${runId}`, {
        params: { status, page, pageSize },
      });
      return response.data as SerpapiRunDetail;
    },
  })(
    { runId: runId ?? "", status, page, pageSize },
    {
      enabled: Boolean(runId),
    }
  );

export const useResolveSerpapiConflict = () =>
  createMutation<{ success: true }, ResolveConflictPayload>({
    mutationFn: (payload) =>
      apiClient
        .post(`/admin/serpapi/runs/${payload.runId}/resolve-conflict`, payload)
        .then((response) => response.data),
  })();

export const useSerpapiNichesQuery = (
  query: string,
  options?: { enabled?: boolean; staleTime?: number }
) =>
  createQuery<SerpapiNicheSummary[], { query: string }>({
    queryKey: (variables) => ["serpapi", "niches", variables.query],
    queryFn: async ({ query: search }) => {
      const response = await apiClient.get("/admin/serpapi/niches", {
        params: search ? { query: search } : undefined,
      });
      return response.data as SerpapiNicheSummary[];
    },
  })({ query }, { enabled: options?.enabled, staleTime: options?.staleTime });

export const useSerpapiNicheCompaniesQuery = (
  nicheId: string | null,
  options?: { enabled?: boolean; staleTime?: number }
) =>
  createQuery<SerpapiNicheCompaniesResponse, { nicheId: string }>({
    queryKey: (variables) => ["serpapi", "niches", variables.nicheId, "companies"],
    queryFn: async ({ nicheId: resolvedId }) => {
      if (!resolvedId) {
        return Promise.resolve(null as unknown as SerpapiNicheCompaniesResponse);
      }
      const response = await apiClient.get(`/admin/serpapi/niches/${resolvedId}/companies`);
      return response.data as SerpapiNicheCompaniesResponse;
    },
  })(
    { nicheId: nicheId ?? "" },
    { enabled: options?.enabled ?? Boolean(nicheId), staleTime: options?.staleTime }
  );

export const useSerpapiMetricsQuery = () =>
  createQuery<SerpapiAllTimeMetrics, Record<string, never>>({
    queryKey: () => ["serpapi", "metrics"],
    queryFn: async () => {
      const response = await apiClient.get("/admin/serpapi/metrics");
      return response.data as SerpapiAllTimeMetrics;
    },
  })({});

export const useSerpapiNicheReprocessMutation = () =>
  createMutation<{ runId: string }, { nicheId: string }>({
    mutationFn: ({ nicheId }) =>
      apiClient.post(`/admin/serpapi/niches/${nicheId}/reprocess`).then((response) => response.data),
  })();

export const useSerpapiNicheDeleteMutation = () =>
  createMutation<{ success: true }, { nicheId: string }>({
    mutationFn: ({ nicheId }) =>
      apiClient.delete(`/admin/serpapi/niches/${nicheId}`).then((response) => response.data),
  })();

export const useSerpapiNicheBulkMutation = () =>
  createMutation<{ total: number; created: number; existing: number }, { labels: string[] }>({
    mutationFn: (payload) =>
      apiClient.post("/admin/serpapi/niches/bulk", payload).then((response) => response.data),
  })();

export const useSerpapiNicheUpdateMutation = () =>
  createMutation<{ id: string; label: string; slug: string }, { nicheId: string; label: string }>({
    mutationFn: ({ nicheId, label }) =>
      apiClient.patch(`/admin/serpapi/niches/${nicheId}`, { label }).then((response) => response.data),
  })();

export const useSerpapiNicheCompanyDeleteMutation = () =>
  createMutation<{ success: true }, { nicheId: string; companyId: string }>({
    mutationFn: ({ nicheId, companyId }) =>
      apiClient
        .delete(`/admin/serpapi/niches/${nicheId}/companies/${companyId}`)
        .then((response) => response.data),
  })();

export const useSerpapiRunPublishMutation = () =>
  createMutation<{ inserted: number; deduped: number; skipped: number }, { runId: string; force?: boolean }>({
    mutationFn: ({ runId, force }) =>
      apiClient.post(`/admin/serpapi/runs/${runId}/publish`, { force }).then((response) => response.data),
  })();

export const useSerpapiApiKeyStatusQuery = () =>
  createQuery<SerpapiApiKeyStatus, Record<string, never>>({
    queryKey: () => ["serpapi", "api-key"],
    queryFn: async () => {
      const response = await apiClient.get("/admin/serpapi/api-key");
      return response.data as SerpapiApiKeyStatus;
    },
  })({});

export const useSerpapiApiKeysQuery = () =>
  createQuery<SerpapiApiKeyItem[], Record<string, never>>({
    queryKey: () => ["serpapi", "api-keys"],
    queryFn: async () => {
      const response = await apiClient.get("/admin/serpapi/api-keys");
      return response.data as SerpapiApiKeyItem[];
    },
  })({});

export const useUpdateSerpapiApiKeyMutation = () =>
  createMutation<SerpapiApiKeyStatus, { apiKey?: string; apiKeyId?: string; label?: string }>({
    mutationFn: (payload) =>
      apiClient.post("/admin/serpapi/api-key", payload).then((response) => response.data),
  })();

export const useSerpapiCompanyQuery = (companyId: string | null, options?: { enabled?: boolean }) =>
  createQuery<SerpapiCompanyDetail, { companyId: string }>({
    queryKey: (variables) => ["serpapi", "company", variables.companyId],
    queryFn: async ({ companyId: resolvedId }) => {
      if (!resolvedId) {
        return Promise.resolve(null as unknown as SerpapiCompanyDetail);
      }
      const response = await apiClient.get(`/admin/companies/${resolvedId}`);
      const data = response.data as {
        id: string;
        name: string;
        addressLine?: string;
        phoneE164?: string | null;
        whatsappE164?: string | null;
        participatesInAuction?: boolean;
        hasWhatsapp?: boolean;
      };
      return {
        id: data.id,
        name: data.name,
        address: data.addressLine ?? "",
        phone: data.phoneE164 ?? null,
        whatsapp: data.whatsappE164 ?? null,
        participatesInAuction: data.participatesInAuction ?? false,
        hasWhatsapp: data.hasWhatsapp ?? Boolean(data.whatsappE164),
      };
    },
  })({ companyId: companyId ?? "" }, { enabled: options?.enabled ?? Boolean(companyId) });

export const useUpdateSerpapiCompanyMutation = () =>
  createMutation<
    {
      id: string;
      name: string;
      addressLine?: string;
      phoneE164?: string | null;
      whatsappE164?: string | null;
      participatesInAuction?: boolean;
      hasWhatsapp?: boolean;
      origin?: string;
    },
    {
      companyId: string;
      payload: {
        name: string;
        address: string;
        phone?: string | null;
        whatsapp?: string | null;
        participatesInAuction?: boolean;
        hasWhatsapp?: boolean;
      };
    }
  >({
    mutationFn: ({ companyId, payload }) =>
      apiClient.patch(`/admin/companies/${companyId}`, payload).then((response) => response.data),
  })();

export const usePublishSerpapiRecordToCompany = () =>
  createMutation<PublishSerpapiRecordResponse, PublishSerpapiRecordPayload>({
    mutationFn: (payload) =>
      apiClient
        .post(`/admin/serpapi/runs/${payload.runId}/records/${payload.recordId}/publish`, {
          statusAfter: payload.statusAfter,
          force: payload.force,
          targetCompanyId: payload.targetCompanyId,
        })
        .then((response) => response.data),
  })();
