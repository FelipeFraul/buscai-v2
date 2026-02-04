import { act } from "react";
import { createRoot } from "react-dom/client";
import { within } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { SerpapiCollectPage } from "@/features/admin/SerpapiCollectPage";

// Silence act warnings for React 18+ tests.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const updateSpy = vi.fn();
const companyData = {
  id: "c1",
  name: "CDA Sorriso",
  address: "Rua A, 123",
  phone: "11999999999",
  whatsapp: "11999999999",
  participatesInAuction: false,
  hasWhatsapp: true,
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
  useSerpapiNicheCompaniesQuery: () => ({
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
      ],
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useSerpapiCompanyQuery: () => ({
    data: companyData,
    isLoading: false,
  }),
  useUpdateSerpapiCompanyMutation: () => ({
    mutateAsync: updateSpy,
    isPending: false,
  }),
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
}));

describe("SerpapiCollectPage flow", () => {
  it("abre modal do nicho, abre edicao e salva a empresa", async () => {
    updateSpy.mockResolvedValue({
      id: "c1",
      name: "CDA Sorriso Atualizado",
      addressLine: "Rua A, 123",
      phoneE164: "11999999999",
      whatsappE164: "11999999999",
      hasWhatsapp: true,
    });
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
    const nicheCard = await scope.findByTestId("serpapi-niche-card");
    await act(async () => {
      await user.click(nicheCard);
    });

    expect(scope.getByText(/Empresas do Nicho: Dentista/i)).toBeInTheDocument();

    const editButton = await scope.findByRole("button", { name: /Editar empresa/i });
    await act(async () => {
      await user.click(editButton);
    });

    const modal = await scope.findByTestId("serpapi-edit-company-modal");
    const modalScope = within(modal);
    const nameInput = modalScope.getByLabelText(/Nome da Empresa/i);
    await act(async () => {
      await user.clear(nameInput);
      await user.type(nameInput, "CDA Sorriso Atualizado");
      await user.click(modalScope.getByRole("button", { name: /^Salvar$/i }));
    });

    expect(updateSpy).toHaveBeenCalledWith({
      companyId: "c1",
      payload: expect.objectContaining({ name: "CDA Sorriso Atualizado" }),
    });
    await act(async () => {
      root.unmount();
    });
    document.body.removeChild(container);
  });
});
