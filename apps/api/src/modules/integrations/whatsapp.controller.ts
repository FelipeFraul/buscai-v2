import { WhatsappWebhookPayloadSchema, type WhatsappWebhookPayload } from "@buscai/shared-schema";
import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { ENV } from "../../config/env";
import { WhatsappService } from "./whatsapp.service";

const WEBHOOK_SECRET = ENV.WHATSAPP_WEBHOOK_SECRET;
const ZAPI_WEBHOOK_TOKEN = ENV.ZAPI_WEBHOOK_TOKEN;
const WEBHOOK_RATE_LIMIT = ENV.WHATSAPP_WEBHOOK_RATE_LIMIT; // requests
const WEBHOOK_RATE_WINDOW_MS = ENV.WHATSAPP_WEBHOOK_RATE_WINDOW_MS;
const WEBHOOK_DEDUPE_WINDOW_MS = 5 * 60 * 1000;
const MAP_CLEANUP_INTERVAL_MS = 60_000;

type Provider = "meta" | "zapi";
type Bucket = { count: number; expiresAt: number };
const webhookRateBuckets = new Map<string, Bucket>();
const webhookMessageDedupe = new Map<string, number>();

const maskPhone = (value?: string | null): string | null => {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length <= 4) {
    return `${digits.slice(0, 1)}***`;
  }
  const prefix = digits.slice(0, 2);
  const suffix = digits.slice(-2);
  return `${prefix}*****${suffix}`;
};

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of webhookRateBuckets) {
    if (bucket.expiresAt < now) {
      webhookRateBuckets.delete(key);
    }
  }
  for (const [messageId, timestamp] of webhookMessageDedupe) {
    if (now - timestamp >= WEBHOOK_DEDUPE_WINDOW_MS) {
      webhookMessageDedupe.delete(messageId);
    }
  }
}, MAP_CLEANUP_INTERVAL_MS).unref();

const SendTestSchema = z.object({
  phone: z.string().min(1),
  message: z.string().min(1),
});

type NormalizedInbound = {
  from: string | null;
  text: string | null;
  mediaUrl?: string | null;
  timestamp?: string | null;
  providerMessageId?: string | null;
  phoneNumberId?: string | null;
};

export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  async handleWebhook(request: FastifyRequest, reply: FastifyReply) {
    const provider = (ENV.WHATSAPP_PROVIDER ?? "meta") as Provider;
    const providedSecret = Array.isArray(request.headers["x-webhook-secret"])
      ? request.headers["x-webhook-secret"]?.[0]
      : request.headers["x-webhook-secret"];
    const queryToken =
      typeof (request.query as { token?: string } | undefined)?.token === "string"
        ? (request.query as { token?: string }).token
        : undefined;

    if (provider === "meta") {
      if (!WEBHOOK_SECRET) {
        request.log.error("whatsapp.webhook.missing_secret_meta");
        return reply.status(503).send({ error: "webhook_not_configured" });
      }
      if (!providedSecret || providedSecret !== WEBHOOK_SECRET) {
        return reply.status(401).send();
      }
    } else {
      if (!WEBHOOK_SECRET && !ZAPI_WEBHOOK_TOKEN) {
        request.log.error("whatsapp.webhook.missing_tokens_zapi");
        return reply.status(503).send({ error: "webhook_not_configured" });
      }

      const hasHeader = WEBHOOK_SECRET && providedSecret === WEBHOOK_SECRET;
      const hasQuery = ZAPI_WEBHOOK_TOKEN && queryToken === ZAPI_WEBHOOK_TOKEN;

      if (!hasHeader && !hasQuery) {
        return reply.status(401).send();
      }
    }

    if (!this.enforceWebhookRateLimit(request)) {
      return reply.status(429).send({ error: "rate_limited" });
    }

    const inboundResult = this.parseInbound(provider, request);
    if (!inboundResult) {
      return reply.status(400).send({ error: "invalid_payload" });
    }

    const inbound = inboundResult;
    const normalized = this.normalizeFrom(inbound.from ?? null);
    const fromForProcessing = normalized.fromE164 ?? inbound.from;

    if (inbound?.messageId) {
      const now = Date.now();
      const lastSeen = webhookMessageDedupe.get(inbound.messageId);
      if (lastSeen && now - lastSeen < WEBHOOK_DEDUPE_WINDOW_MS) {
        request.log.info(
          {
            messageId: inbound.messageId,
            phoneMasked: maskPhone(inbound.from) ?? null,
            hasText: Boolean(inbound.text),
          },
          "whatsapp.webhook.duplicate"
        );
        if (!reply.sent) {
          return reply.status(200).send({ ok: true });
        }
        return reply;
      }
      webhookMessageDedupe.set(inbound.messageId, now);
    }

    request.log.info(
      {
        messageId: inbound?.messageId ?? null,
        phoneMasked: maskPhone(fromForProcessing ?? normalized.fromRaw) ?? null,
        hasText: Boolean(inbound?.text),
        timestamp: inbound?.timestamp ?? null,
      },
      "whatsapp.webhook.inbound"
    );

    if (fromForProcessing && inbound?.text) {
      void this.whatsappService
        .handleInboundSearch({
          from: fromForProcessing,
          text: inbound.text,
          phoneNumberId: inbound.phoneNumberId ?? null,
          messageId: inbound.messageId ?? null,
        })
        .catch((error) => {
          request.log.error(
            {
              error: (error as Error).message,
              phoneMasked: maskPhone(fromForProcessing) ?? null,
            },
            "whatsapp.webhook.process_failed"
          );
        });
    }

    if (!reply.sent) {
      return reply.status(200).send({ ok: true });
    }
    return reply;
  }

  async sendTest(request: FastifyRequest, reply: FastifyReply) {
    const payload = SendTestSchema.parse(request.body ?? {});
    await this.whatsappService.sendTestMessage(payload.phone, payload.message);
    return reply.status(200).send({ ok: true });
  }

  private enforceWebhookRateLimit(request: FastifyRequest): boolean {
    const key = request.ip || request.headers["x-webhook-secret"]?.toString() || "unknown";
    const now = Date.now();
    const bucket = webhookRateBuckets.get(key);

    if (!bucket || bucket.expiresAt < now) {
      webhookRateBuckets.set(key, { count: 1, expiresAt: now + WEBHOOK_RATE_WINDOW_MS });
      return true;
    }

    if (bucket.count >= WEBHOOK_RATE_LIMIT) {
      return false;
    }

    bucket.count += 1;
    return true;
  }

  private extractInbound(payload: WhatsappWebhookPayload) {
    const entry = payload.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];
    const phoneNumberId = value?.metadata?.phone_number_id ?? null;

    if (!message) {
      return null;
    }

    return {
      messageId: message.id ?? null,
      from: message.from ?? null,
      text: message.text?.body ?? null,
      timestamp: message.timestamp ?? null,
      phoneNumberId,
    };
  }

  private parseInbound(provider: Provider, request: FastifyRequest) {
    if (provider === "meta") {
      const parsed = WhatsappWebhookPayloadSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        request.log.warn("whatsapp.webhook.invalid_payload");
        return null;
      }
      return this.extractInbound(parsed.data);
    }

    const parsed = this.parseZapiPayload(request.body ?? {});
    if (!parsed?.from) {
      request.log.warn(
        {
          reason: "missing_from",
          sample: this.sanitizePayload(request.body ?? {}),
        },
        "whatsapp.webhook.zapi_parse_failed"
      );
      return null;
    }
    if (!parsed.text) {
      request.log.warn(
        {
          reason: "missing_text",
          from: parsed.from,
          sample: this.sanitizePayload(request.body ?? {}),
        },
        "whatsapp.webhook.zapi_parse_warning"
      );
    }

    return {
      from: parsed.from,
      text: parsed.text ?? null,
      messageId: parsed.providerMessageId ?? null,
      timestamp: parsed.timestamp ?? null,
      phoneNumberId: null,
    };
  }

  private parseZapiPayload(payload: any): NormalizedInbound | null {
    const from =
      this.getString(payload, ["phone"]) ??
      this.getString(payload, ["from"]) ??
      this.getString(payload, ["sender", "phone"]) ??
      this.getString(payload, ["sender", "id"]) ??
      this.getString(payload, ["chatId"]) ??
      this.getString(payload, ["data", "phone"]) ??
      this.getString(payload, ["data", "from"]) ??
      this.getString(payload, ["data", "sender", "phone"]) ??
      this.getString(payload, ["data", "sender", "id"]) ??
      this.getString(payload, ["message", "from"]) ??
      this.getString(payload, ["messages", 0, "from"]);

    const text =
      this.getString(payload, ["text"]) ??
      this.getString(payload, ["text", "message"]) ??
      this.getString(payload, ["message"]) ??
      this.getString(payload, ["body"]) ??
      this.getString(payload, ["data", "text"]) ??
      this.getString(payload, ["data", "message"]) ??
      this.getString(payload, ["data", "body"]) ??
      this.getString(payload, ["message", "text", "message"]) ??
      this.getString(payload, ["message", "text", "body"]) ??
      this.getString(payload, ["data", "message", "text", "message"]) ??
      this.getString(payload, ["data", "message", "text", "body"]) ??
      this.getString(payload, ["data", "message", "body", "text"]) ??
      this.getString(payload, ["data", "message", "content"]) ??
      this.getString(payload, ["data", "message", "text"]) ??
      this.getString(payload, ["data", "message", "body"]) ??
      this.getString(payload, ["message", "text"]) ??
      this.getString(payload, ["message", "body"]) ??
      this.getString(payload, ["listResponseMessage", "selectedRowId"]) ??
      this.getString(payload, ["listResponseMessage", "title"]) ??
      this.getString(payload, ["listResponseMessage", "message"]) ??
      this.getString(payload, ["data", "listResponseMessage", "selectedRowId"]) ??
      this.getString(payload, ["data", "listResponseMessage", "title"]) ??
      this.getString(payload, ["data", "listResponseMessage", "message"]) ??
      this.getString(payload, ["message", "listResponseMessage", "selectedRowId"]) ??
      this.getString(payload, ["message", "listResponseMessage", "title"]) ??
      this.getString(payload, ["message", "listResponseMessage", "message"]) ??
      this.getString(payload, ["messages", 0, "listResponseMessage", "selectedRowId"]) ??
      this.getString(payload, ["messages", 0, "listResponseMessage", "title"]) ??
      this.getString(payload, ["messages", 0, "listResponseMessage", "message"]) ??
      this.getString(payload, ["messages", 0, "text"]) ??
      this.getString(payload, ["messages", 0, "body"]) ??
      this.getString(payload, ["messages", 0, "text", "message"]) ??
      this.getString(payload, ["messages", 0, "text", "body"]) ??
      this.getString(payload, ["data", "messages", 0, "text", "message"]) ??
      this.getString(payload, ["data", "messages", 0, "text", "body"]) ??
      this.getString(payload, ["messages", 0, "caption"]);

    const mediaUrl =
      this.getString(payload, ["image", "url"]) ??
      this.getString(payload, ["media", "url"]) ??
      this.getString(payload, ["message", "media", "url"]) ??
      this.getString(payload, ["message", "image", "url"]) ??
      this.getString(payload, ["messages", 0, "media", "url"]) ??
      this.getString(payload, ["messages", 0, "image", "url"]) ??
      this.getString(payload, ["messages", 0, "file", "url"]) ??
      this.getString(payload, ["data", "media", "url"]) ??
      this.getString(payload, ["data", "image", "url"]);

    const providerMessageId =
      this.getString(payload, ["messageId"]) ??
      this.getString(payload, ["id"]) ??
      this.getString(payload, ["data", "messageId"]) ??
      this.getString(payload, ["data", "id"]) ??
      this.getString(payload, ["message", "id"]) ??
      this.getString(payload, ["messages", 0, "id"]);

    const timestampRaw =
      this.getString(payload, ["timestamp"]) ??
      this.getString(payload, ["momment"]) ??
      this.getString(payload, ["data", "timestamp"]) ??
      this.getString(payload, ["message", "timestamp"]) ??
      this.getString(payload, ["messages", 0, "timestamp"]);

    const timestamp = timestampRaw ? String(timestampRaw) : null;

    return {
      from,
      text: text ?? null,
      mediaUrl: mediaUrl ?? null,
      timestamp,
      providerMessageId: providerMessageId ?? null,
    };
  }

  private normalizeFrom(raw: string | null) {
    const fromRaw = raw ?? null;
    const digits = fromRaw ? fromRaw.replace(/\D/g, "") : "";
    const fromDigits = digits || null;
    if (!fromDigits) {
      return { fromRaw, fromDigits: null, fromE164: null, fromBr: null };
    }

    const hasCountry = fromDigits.startsWith("55");
    const fromE164 = hasCountry ? fromDigits : `55${fromDigits}`;
    const fromBr = hasCountry && fromDigits.length >= 12 ? fromDigits.slice(2) : null;

    return { fromRaw, fromDigits, fromE164, fromBr };
  }

  private getString(payload: any, path: Array<string | number>): string | null {
    let cursor: any = payload;
    for (const key of path) {
      if (cursor == null) return null;
      cursor = cursor[key as any];
    }
    if (typeof cursor === "string" && cursor.trim().length > 0) {
      return cursor.trim();
    }
    if (typeof cursor === "number") {
      return String(cursor);
    }
    return null;
  }

  private sanitizePayload(payload: any, depth = 2): any {
    if (depth <= 0) return "[truncated]";
    if (payload === null || payload === undefined) return payload;
    if (typeof payload === "string") {
      const trimmed = payload.trim();
      return trimmed.length > 200 ? `${trimmed.slice(0, 200)}...` : trimmed;
    }
    if (typeof payload === "number" || typeof payload === "boolean") {
      return payload;
    }
    if (Array.isArray(payload)) {
      return payload.slice(0, 3).map((item) => this.sanitizePayload(item, depth - 1));
    }
    if (typeof payload === "object") {
      const entries = Object.entries(payload).slice(0, 30);
      const out: Record<string, any> = {};
      for (const [key, value] of entries) {
        if (key.toLowerCase().includes("token") || key.toLowerCase().includes("secret")) {
          out[key] = "[redacted]";
        } else {
          out[key] = this.sanitizePayload(value, depth - 1);
        }
      }
      return out;
    }
    return "[unknown]";
  }
}
