import { act } from "react";
import { createRoot } from "react-dom/client";
import { within } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { SerpapiEditCompanyModal } from "./SerpapiEditCompanyModal";

// Silence act warnings for React 18+ tests.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const updateSpy = vi.fn();
const companyData = {
  id: "company-1",
  name: "Empresa Antiga",
  address: "Rua A, 123",
  phone: "11999999999",
  whatsapp: "11999999999",
  participatesInAuction: false,
  hasWhatsapp: true,
};

vi.mock("@/components/ui/ToastProvider", () => ({
  useToast: () => ({ pushToast: vi.fn() }),
}));

vi.mock("@/features/admin/serpapi/api", () => ({
  useSerpapiCompanyQuery: () => ({
    data: companyData,
    isLoading: false,
  }),
  useUpdateSerpapiCompanyMutation: () => ({
    mutateAsync: updateSpy,
    isPending: false,
  }),
}));

describe("SerpapiEditCompanyModal", () => {
  it("edita o nome e salva via PATCH", async () => {
    updateSpy.mockResolvedValue({
      id: "company-1",
      name: "Empresa Nova",
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
          <SerpapiEditCompanyModal open nicheId="niche-1" companyId="company-1" onClose={() => undefined} />
        </QueryClientProvider>
      );
    });

    const scope = within(container);
    const nameInput = scope.getByLabelText(/Nome da Empresa/i);
    await act(async () => {
      await user.clear(nameInput);
      await user.type(nameInput, "Empresa Nova");
      await user.click(scope.getByRole("button", { name: /Salvar/i }));
    });

    expect(updateSpy).toHaveBeenCalledWith({
      companyId: "company-1",
      payload: expect.objectContaining({ name: "Empresa Nova" }),
    });
    await act(async () => {
      root.unmount();
    });
    document.body.removeChild(container);
  });
});
