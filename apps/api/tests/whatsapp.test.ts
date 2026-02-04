import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  type SearchResponse,
  type WhatsappWebhookPayload,
} from "@buscai/shared-schema";

let WhatsappService: any;
let InternalAuditService: any;

const fakeSearchService = {
  search: vi.fn(async () => ({ searchId: "s1", results: [] } satisfies SearchResponse)),
};

const fakeAuditService = {
  logEvent: vi.fn(async () => undefined),
} as unknown as InternalAuditService;

const httpClient = {
  post: vi.fn(async () => undefined),
} as any;

const payload: WhatsappWebhookPayload = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "e1",
      changes: [
        {
          value: {
            messages: [
              {
                from: "5511999999999",
                id: "wamid.TEST",
                timestamp: "1",
                type: "text",
                text: { body: "test query" },
              },
            ],
            metadata: {
              phone_number_id: "phone-id",
            },
          },
        },
      ],
    },
  ],
};

describe("WhatsappService", () => {
  beforeAll(async () => {
    process.env.WHATSAPP_API_URL = process.env.WHATSAPP_API_URL ?? "http://localhost";
    process.env.WHATSAPP_API_TOKEN =
      process.env.WHATSAPP_API_TOKEN ?? "token-for-tests-123456789";
    process.env.WHATSAPP_WEBHOOK_SECRET =
      process.env.WHATSAPP_WEBHOOK_SECRET ?? "webhook-secret-123456";
    process.env.CLAIM_SUPPORT_WHATSAPP =
      process.env.CLAIM_SUPPORT_WHATSAPP ?? "5515999999999";
    process.env.SERPAPI_API_KEY = process.env.SERPAPI_API_KEY ?? "serpapi-test-key";
    process.env.WHATSAPP_DEFAULT_CITY_ID =
      process.env.WHATSAPP_DEFAULT_CITY_ID ?? "00000000-0000-0000-0000-000000000000";
    process.env.WHATSAPP_DEFAULT_NICHE_ID =
      process.env.WHATSAPP_DEFAULT_NICHE_ID ?? "niche-for-tests";

    const module = await import("../src/modules/integrations/whatsapp.service");
    WhatsappService = module.WhatsappService;
    const auditModule = await import("../src/modules/internal-audit/internal-audit.service");
    InternalAuditService = auditModule.InternalAuditService;
  });

  it("extracts inbound messages and maps to search", async () => {
    const service = new WhatsappService(fakeSearchService as any, fakeAuditService, httpClient);

    const messages = service.extractInboundMessages(payload);
    expect(messages[0].text).toBe("test query");

    const searchReq = service.normalizeToSearchRequest(messages[0]);
    expect(searchReq.cityId).toBeTruthy();
    expect(searchReq.source).toBe("whatsapp");
  });

  it("skips send when token missing", async () => {
    const service = new WhatsappService(fakeSearchService as any, fakeAuditService, httpClient);
    // force missing token for this instance
    (service as any).apiToken = "";
    await (service as any).sendText("1", "hi");
    expect(fakeAuditService.logEvent).toHaveBeenCalled();
  });
});
