import { describe, expect, it, vi } from "vitest";

import { SerpapiService } from "../src/modules/serpapi/serpapi.service";

describe("SerpapiService preview sanitization", () => {
  it("strips sensitive fields and truncates preview", async () => {
    const longTitle = "A".repeat(2500);
    const repo = {
      getRun: vi.fn().mockResolvedValue({
        id: "run-1",
        status: "done",
      }),
      listRecords: vi.fn().mockResolvedValue({
        total: 2,
        items: [
          {
            id: "record-1",
            status: "inserted",
            companyId: null,
            dedupeKey: null,
            reason: "reason",
            rawPayload: {
              title: longTitle,
              name: "Nome",
              address: "Rua X",
              website: "https://example.com",
              phone: "551199999999",
              email: "admin@example.com",
              apiKey: "secret",
              headers: { Authorization: "Bearer token" },
              document: "123456789",
              extra: "should disappear",
            },
          },
          {
            id: "record-2",
            status: "inserted",
            companyId: null,
            dedupeKey: null,
            reason: "reason",
            rawPayload: "{not valid json",
          },
        ],
      }),
    };

    const service = new SerpapiService(repo as any, {} as any);
    const result = await service.listRecordsForRun("run-1");
    expect(result).toBeTruthy();

    const [preview1, preview2] = result!.items.map((item) => item.rawPreview ?? "");
    expect(preview1).not.toContain("phone");
    expect(preview1).not.toContain("email");
    expect(preview1).not.toContain("apiKey");
    expect(preview1).not.toContain("headers");
    expect(preview1).not.toContain("document");
    expect(preview1).not.toContain("extra");
    expect(preview1).not.toContain("Bearer");
    expect(preview1).not.toContain("sk_");
    expect(preview1).not.toContain("normalizedPhone");
    expect(preview1).toContain("\"title\"");
    expect(preview1.length).toBeLessThanOrEqual(2000);
    expect(preview1.endsWith("...")).toBe(true);
    expect(preview2).toBe("{}");
  });
});
