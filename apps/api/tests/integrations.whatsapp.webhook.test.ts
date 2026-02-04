import fastify from "fastify";
import { describe, expect, it, vi } from "vitest";

import type { WhatsappWebhookPayload } from "@buscai/shared-schema";
import type { WhatsappService } from "../src/modules/integrations/whatsapp.service";

function setEnv() {
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? "secret-secret-secret-123";
  process.env.REFRESH_SECRET = process.env.REFRESH_SECRET ?? "refresh-secret-456789";
  process.env.WHATSAPP_WEBHOOK_SECRET = "super-secret-webhook";
  process.env.WHATSAPP_PROVIDER = "meta";
  process.env.WHATSAPP_WEBHOOK_RATE_LIMIT = "5";
  process.env.WHATSAPP_WEBHOOK_RATE_WINDOW_MS = "60000";
  process.env.WHATSAPP_API_URL = "http://localhost";
  process.env.WHATSAPP_API_TOKEN = "token-for-tests-123456789";
  process.env.CLAIM_SUPPORT_WHATSAPP = "5515999999999";
  process.env.SERPAPI_API_KEY = "serpapi-test-key";
  process.env.WHATSAPP_DEFAULT_CITY_ID =
    process.env.WHATSAPP_DEFAULT_CITY_ID ?? "00000000-0000-0000-0000-000000000000";
  process.env.WHATSAPP_DEFAULT_NICHE_ID = process.env.WHATSAPP_DEFAULT_NICHE_ID ?? "niche-for-tests";
}

async function buildApp() {
  setEnv();
  vi.resetModules();

  const { WhatsappController } = await import("../src/modules/integrations/whatsapp.controller");

  const whatsappService = {
    handleInboundSearch: vi.fn().mockResolvedValue(undefined),
  } as unknown as WhatsappService;

  const controller = new WhatsappController(whatsappService);
  const app = fastify();
  app.post("/integrations/whatsapp/webhook", (request, reply) =>
    controller.handleWebhook(request, reply)
  );

  await app.ready();
  return { app };
}

const validPayload: WhatsappWebhookPayload = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "entry-1",
      changes: [
        {
          value: {
            metadata: { phone_number_id: "12345" },
            messages: [
              {
                id: "msg-1",
                from: "5511999999999",
                to: "12345",
                type: "text",
                text: { body: "Olǭ" },
              },
            ],
          },
          field: "messages",
        },
      ],
    },
  ],
};

describe("Whatsapp webhook inbound", () => {
  it("returns 401 when secret is invalid", async () => {
    const { app } = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/integrations/whatsapp/webhook",
      payload: validPayload,
    });

    expect(response.statusCode).toBe(401);
  });

  it("returns 200 when secret is valid", async () => {
    const { app } = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/integrations/whatsapp/webhook",
      headers: { "x-webhook-secret": "super-secret-webhook" },
      payload: validPayload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });

  it("dedupes by messageId without failing", async () => {
    const { app } = await buildApp();

    const first = await app.inject({
      method: "POST",
      url: "/integrations/whatsapp/webhook",
      headers: { "x-webhook-secret": "super-secret-webhook" },
      payload: validPayload,
    });
    const second = await app.inject({
      method: "POST",
      url: "/integrations/whatsapp/webhook",
      headers: { "x-webhook-secret": "super-secret-webhook" },
      payload: validPayload,
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
  });
});
