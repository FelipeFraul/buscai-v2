import { beforeAll, describe, expect, it } from "vitest";

import { applyFaultInjection } from "@/lib/testing/fault-injection";

describe("fault injection utility", () => {
  beforeAll(() => {
    const fakeWindow: Window & typeof globalThis = {
      location: { search: "" } as Location,
      history: {
        replaceState: (_a: unknown, _b: unknown, url: string) => {
          fakeWindow.location.search = url.split("?")[1]
            ? `?${url.split("?")[1]}`
            : "";
        },
      } as History,
    } as Window & typeof globalThis;
    (globalThis as unknown as { window: Window & typeof globalThis }).window = fakeWindow;
  });

  it("returns invalid payload when fault=invalid", () => {
    const original = window.location.search;
    window.history.replaceState({}, "", "?fault=invalid");
    const fi = applyFaultInjection();
    expect(fi.simulateInvalid()).toContain("invalid");
    window.history.replaceState({}, "", original);
  });

  it("simulates slow when fault=slow", async () => {
    const original = window.location.search;
    window.history.replaceState({}, "", "?fault=slow");
    const fi = applyFaultInjection();
    const start = Date.now();
    await fi.simulateSlow();
    expect(Date.now() - start).toBeGreaterThanOrEqual(1400);
    window.history.replaceState({}, "", original);
  });
});
