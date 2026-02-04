import fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { WhatsappWebhookPayload } from "@buscai/shared-schema";
import type { WhatsappService } from "../src/modules/integrations/whatsapp.service";

function setEnv(overrides: { rateLimit?: number } = {}) {
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? "secret-secret-secret-123";
  process.env.REFRESH_SECRET = process.env.REFRESH_SECRET ?? "refresh-secret-456789";
  process.env.WHATSAPP_WEBHOOK_SECRET = "super-secret-webhook";
  process.env.WHATSAPP_PROVIDER = "meta";
  process.env.WHATSAPP_WEBHOOK_RATE_LIMIT = String(overrides.rateLimit ?? 5);
  process.env.WHATSAPP_WEBHOOK_RATE_WINDOW_MS = "60000";
  process.env.WHATSAPP_API_URL = "http://localhost";
  process.env.WHATSAPP_API_TOKEN = "token-for-tests-123456789";
  process.env.CLAIM_SUPPORT_WHATSAPP = "5515999999999";
  process.env.SERPAPI_API_KEY = "serpapi-test-key";
  process.env.WHATSAPP_DEFAULT_CITY_ID =
    process.env.WHATSAPP_DEFAULT_CITY_ID ?? "00000000-0000-0000-0000-000000000000";
  process.env.WHATSAPP_DEFAULT_NICHE_ID = process.env.WHATSAPP_DEFAULT_NICHE_ID ?? "niche-for-tests";
}

async function buildApp(rateLimit?: number) {
  setEnv({ rateLimit });
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
  return { app, whatsappService };
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
                text: { body: "Olá" },
              },
            ],
          },
          field: "messages",
        },
      ],
    },
  ],
};

describe("WhatsappController webhook", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 401 when secret is missing/invalid", async () => {
    const { app, whatsappService } = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/integrations/whatsapp/webhook",
      payload: validPayload,
    });

    expect(response.statusCode).toBe(401);
    expect(whatsappService.handleInboundSearch).not.toHaveBeenCalled();
  });

  it("returns 429 when rate limit exceeded", async () => {
    const { app, whatsappService } = await buildApp(1);

    const first = await app.inject({
      method: "POST",
      url: "/integrations/whatsapp/webhook",
      headers: { "x-webhook-secret": "super-secret-webhook" },
      payload: validPayload,
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: "POST",
      url: "/integrations/whatsapp/webhook",
      headers: { "x-webhook-secret": "super-secret-webhook" },
      payload: validPayload,
    });
    expect(second.statusCode).toBe(429);
    expect(whatsappService.handleInboundSearch).toHaveBeenCalledTimes(1);
  });

  it("returns 400 for invalid payload", async () => {
    const { app, whatsappService } = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/integrations/whatsapp/webhook",
      headers: { "x-webhook-secret": "super-secret-webhook" },
      payload: { foo: "bar" },
    });

    expect(response.statusCode).toBe(400);
    expect(whatsappService.handleInboundSearch).not.toHaveBeenCalled();
  });

  it("returns 200 for valid payload", async () => {
    const { app, whatsappService } = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/integrations/whatsapp/webhook",
      headers: { "x-webhook-secret": "super-secret-webhook" },
      payload: validPayload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    expect(whatsappService.handleInboundSearch).toHaveBeenCalledTimes(1);
  });

  it("dedupes by messageId without failing", async () => {
    const { app, whatsappService } = await buildApp();

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
    expect(whatsappService.handleInboundSearch).toHaveBeenCalledTimes(1);
  });
});
