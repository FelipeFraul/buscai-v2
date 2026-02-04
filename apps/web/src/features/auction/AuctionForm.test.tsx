import { act } from "react";
import { createRoot } from "react-dom/client";
import { within } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AuctionForm } from "./AuctionForm";

const mutateMock = vi.fn();

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/features/catalog/useCatalog", () => ({
  useCities: () => ({ data: [{ id: "city-1", name: "Cidade", state: "SP" }] }),
  useNiches: () => ({ data: [{ id: "niche-1", label: "Nicho" }] }),
}));

vi.mock("./useAuctionConfigs", () => ({
  useSaveAuctionConfig: () => ({
    mutate: mutateMock,
    isPending: false,
  }),
  useAuctionSlots: () => ({
    isLoading: false,
    data: {
      slots: [
        { position: 1, currentBid: 300, company: { tradeName: "Empresa Alpha" } },
        { position: 2, currentBid: 200 },
        { position: 3, currentBid: 150 },
      ],
    },
  }),
  useAuctionSummary: () => ({
    isLoading: false,
    data: {
      todaySpentCents: 0,
      todayImpressionsPaid: 0,
      todayClicks: 0,
      status: "active",
      walletBalanceCents: 0,
      walletReservedCents: 0,
      avgPaidPosition: null,
      ctr: null,
    },
  }),
}));

describe("AuctionForm", () => {
  const getModeControl = (scope: ReturnType<typeof within>, label: string) => {
    const matcher = new RegExp(label, "i");
    return (
      scope.queryByRole("radio", { name: matcher }) ??
      scope.queryByRole("button", { name: matcher })
    );
  };

  const getManualBidInput = (scope: ReturnType<typeof within>) =>
    scope.queryByPlaceholderText(/R\$/i) as HTMLInputElement | null;

  it("shows auto layout and hides manual inputs when auto is selected", async () => {
    mutateMock.mockClear();
    const user = userEvent.setup();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <AuctionForm companyId="company-1" onClose={() => undefined} />
      );
    });

    const scope = within(container);
    expect(scope.getByText(/Quanto voce aceita pagar por visualizacao/i)).toBeInTheDocument();

    const autoControl = getModeControl(scope, "Automatico");
    expect(autoControl).not.toBeNull();

    await act(async () => {
      await user.click(autoControl!);
    });

    expect(scope.getByText(/Como funciona/i)).toBeInTheDocument();
    expect(scope.getByText(/Posicao 1/i)).toBeInTheDocument();
    expect(scope.getByText(/Posicao 2/i)).toBeInTheDocument();
    expect(scope.getByText(/Posicao 3/i)).toBeInTheDocument();
    expect(scope.getByText(/Empresa:\s*Empresa Alpha/i)).toBeInTheDocument();
    expect(scope.getAllByText(/Empresa:\s*\u2014/i).length).toBeGreaterThan(0);
    expect(getManualBidInput(scope)).toBeNull();

    await act(async () => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it("rounds manual bid up to the next R$ 0,50 step", async () => {
    mutateMock.mockClear();
    const user = userEvent.setup();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<AuctionForm companyId="company-1" onClose={() => undefined} />);
    });

    const scope = within(container);
    const manualControl = getModeControl(scope, "Manual");
    if (manualControl) {
      await user.click(manualControl);
    }

    const citySelect = scope.getByRole("combobox", { name: /Cidade/i });
    const nicheSelect = scope.getByRole("combobox", { name: /Nicho/i });
    await act(async () => {
      await user.selectOptions(citySelect, "city-1");
      await user.selectOptions(nicheSelect, "niche-1");
    });

    const bidInput = getManualBidInput(scope);
    expect(bidInput).not.toBeNull();

    await act(async () => {
      await user.clear(bidInput!);
      await user.type(bidInput!, "3.01");
      await user.tab();
    });

    expect(Number(bidInput!.value)).toBe(3.5);

    const submitButton = scope.getByRole("button", { name: /Salvar/i });
    await act(async () => {
      await user.click(submitButton);
    });

    expect(mutateMock).toHaveBeenCalled();
    const payload = mutateMock.mock.calls[0]?.[0];
    expect(payload?.bids?.position1).toBe(350);

    await act(async () => {
      root.unmount();
    });
    document.body.removeChild(container);
  });
});
