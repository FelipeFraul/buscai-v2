import { act } from "react";
import { createRoot } from "react-dom/client";
import { within } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { SerpapiCollectPage } from "./SerpapiCollectPage";

// Silence act warnings for React 18+ tests.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const nicheCompaniesSpy = vi.fn();
const companyData = {
  id: "c1",
  name: "CDA Sorriso",
  address: "Rua A, 123",
  phone: "11999999999",
  whatsapp: "11999999999",
  participatesInAuction: false,
  hasWhatsapp: true,
  origin: "serpapi",
};

vi.mock("@/components/ui/ToastProvider", () => ({
  useToast: () => ({ pushToast: vi.fn() }),
}));

vi.mock("@/features/catalog/useCatalog", () => ({
  useCities: () => ({ data: [] }),
  useNiches: () => ({ data: [] }),
}));

vi.mock("@/features/admin/serpapi/api", () => ({
  useRunsQuery: () => ({ data: [], isLoading: false, isError: false }),
  startImportMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  startManualImportMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  invalidateRunMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSerpapiNichesQuery: () => ({
    data: [{ nicheId: "n1", nicheName: "Dentista", companiesCount: 12 }],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useSerpapiNicheCompaniesQuery: (nicheId: string | null) => {
    nicheCompaniesSpy(nicheId);
    return {
      data: {
        niche: { id: "n1", name: "Dentista" },
        companies: [
          {
            id: "c1",
            name: "CDA Sorriso",
            address: "Rua A, 123",
            phone: "11999999999",
            whatsapp: "11999999999",
            hasWhatsapp: true,
            source: "serpapi",
            createdAt: "2024-01-01T00:00:00.000Z",
          },
          {
            id: "c2",
            name: "Oficina Manual",
            address: "Rua B, 456",
            phone: "1133334444",
            whatsapp: null,
            hasWhatsapp: false,
            source: "manual",
            createdAt: "2024-01-02T00:00:00.000Z",
          },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };
  },
  useSerpapiNicheReprocessMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSerpapiNicheDeleteMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSerpapiNicheCompanyDeleteMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSerpapiNicheUpdateMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSerpapiRunPublishMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSerpapiApiKeyStatusQuery: () => ({
    data: { isConfigured: false, updatedAt: null, activeApiKeyId: null },
    isLoading: false,
  }),
  useSerpapiApiKeysQuery: () => ({ data: [], isLoading: false, isError: false }),
  useUpdateSerpapiApiKeyMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSerpapiCompanyQuery: () => ({
    data: companyData,
    isLoading: false,
  }),
  useUpdateSerpapiCompanyMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

describe("SerpapiCollectPage", () => {
  it("abre o modal ao clicar no card e renderiza empresas do nicho", async () => {
    nicheCompaniesSpy.mockClear();
    const user = userEvent.setup();
    const queryClient = new QueryClient();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <SerpapiCollectPage />
          </MemoryRouter>
        </QueryClientProvider>
      );
    });

    const scope = within(container);
    const card = await scope.findByTestId("serpapi-niche-card");
    await act(async () => {
      await user.click(card);
    });

    expect(await scope.findByText(/Empresas do Nicho: Dentista/i)).toBeInTheDocument();
    expect(scope.getByText("CDA Sorriso")).toBeInTheDocument();
    expect(scope.getByText("SerpAPI")).toBeInTheDocument();
    expect(scope.getByText("Manual")).toBeInTheDocument();
    expect(nicheCompaniesSpy).toHaveBeenCalledWith("n1");
    await act(async () => {
      root.unmount();
    });
    document.body.removeChild(container);
  });
});
