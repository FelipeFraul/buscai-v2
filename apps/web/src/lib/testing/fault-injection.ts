export function applyFaultInjection(): {
  simulateSlow: () => Promise<void>;
  simulateError: () => never;
  simulateInvalid: () => string;
} {
  const params = new URLSearchParams(window.location.search);
  const fault = params.get("fault");

  return {
    simulateSlow: async () => {
      if (fault === "slow") {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    },
    simulateError: () => {
      if (fault === "error") {
        throw new Error("Fault injection: simulated error");
      }
      throw new Error("Fault injection disabled");
    },
    simulateInvalid: () => {
      if (fault === "invalid") {
        return "{ invalid payload";
      }
      return "";
    },
  };
}
