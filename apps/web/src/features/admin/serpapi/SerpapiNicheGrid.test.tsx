import { act } from "react";
import { createRoot } from "react-dom/client";
import { within } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SerpapiNicheGrid } from "./SerpapiNicheGrid";

// Silence act warnings for React 18+ tests.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const niches = [
  { nicheId: "n1", nicheName: "Dentista", companiesCount: 12 },
  { nicheId: "n2", nicheName: "Arquiteto", companiesCount: 8 },
];

describe("SerpapiNicheGrid", () => {
  it("renderiza os cards de nicho", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(<SerpapiNicheGrid items={niches} query="" onSelect={() => undefined} />);
    });
    const scope = within(container);
    expect(scope.getByText("Dentista")).toBeInTheDocument();
    expect(scope.getByText("Arquiteto")).toBeInTheDocument();
    expect(scope.getAllByTestId("serpapi-niche-card")).toHaveLength(2);
    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it("filtra lista localmente pelo nome", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(<SerpapiNicheGrid items={niches} query="dent" onSelect={() => undefined} />);
    });
    const scope = within(container);
    expect(scope.getByText("Dentista")).toBeInTheDocument();
    expect(scope.queryByText("Arquiteto")).not.toBeInTheDocument();
    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it("dispara handler ao clicar no card", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<SerpapiNicheGrid items={niches} query="" onSelect={onSelect} />);
    });
    const scope = within(container);
    await user.click(scope.getByText("Dentista"));
    expect(onSelect).toHaveBeenCalledWith(niches[0]);
    await act(async () => {
      root.unmount();
    });
    document.body.removeChild(container);
  });
});
