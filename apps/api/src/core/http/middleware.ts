import { randomUUID } from "crypto";

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

import { chaosOnRequest, chaosOnSend } from "./chaos";
import { requestCounter } from "./metrics";

type RateLimitTier = "public" | "auth" | "whatsapp";

const RATE_LIMITS: Record<RateLimitTier, { limit: number; windowMs: number }> = {
  public: { limit: 60, windowMs: 60_000 },
  auth: { limit: 120, windowMs: 60_000 },
  whatsapp: { limit: 30, windowMs: 60_000 },
};

type Bucket = { count: number; expiresAt: number };
const rateStore = new Map<string, Bucket>();
const RATE_STORE_CLEANUP_INTERVAL_MS = 60_000;

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateStore.entries()) {
    if (bucket.expiresAt <= now) {
      rateStore.delete(key);
    }
  }
}, RATE_STORE_CLEANUP_INTERVAL_MS).unref();

function identifyTier(request: FastifyRequest): RateLimitTier {
  if (request.url.startsWith("/integrations/whatsapp")) {
    return "whatsapp";
  }

  if (typeof request.headers.authorization === "string") {
    return "auth";
  }

  return "public";
}

function simpleHash(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return `${hash}`;
}

function resolveRouteGroup(request: FastifyRequest): string {
  const pathname = request.url.split("?")[0] ?? "/";
  const segments = pathname.split("/").filter(Boolean).slice(0, 2);
  return segments.length ? segments.join("/") : "root";
}

function getRateKey(tier: RateLimitTier, request: FastifyRequest): string {
  const userId = (request as FastifyRequest & { user?: { id?: string } }).user?.id;
  const uaHeader = Array.isArray(request.headers["user-agent"])
    ? request.headers["user-agent"][0] ?? ""
    : request.headers["user-agent"] ?? "";
  const uaHash = simpleHash(String(uaHeader));
  const routeGroup = resolveRouteGroup(request);
  const actor = userId ?? "anonymous";
  return `${tier}:${actor}:${request.ip}:${uaHash}:${routeGroup}`;
}

function enforceRateLimit(request: FastifyRequest, reply: FastifyReply): boolean {
  const tier = identifyTier(request);
  const { limit, windowMs } = RATE_LIMITS[tier];
  const key = getRateKey(tier, request);
  const now = Date.now();
  const bucket = rateStore.get(key);

  if (!bucket || bucket.expiresAt < now) {
    rateStore.set(key, { count: 1, expiresAt: now + windowMs });
    return true;
  }

  if (bucket.count >= limit) {
    reply.status(429).send({
      code: "rate_limit_exceeded",
      message: "Too many requests",
      details: { tier, limit, windowSeconds: Math.ceil(windowMs / 1000) },
    });
    return false;
  }

  bucket.count += 1;
  return true;
}

function applyTimeout(request: FastifyRequest, reply: FastifyReply): void {
  const timeoutMs = request.url.startsWith("/integrations/whatsapp")
    ? 2000
    : request.url.startsWith("/auth/login")
      ? 10000
      : request.url.startsWith("/admin/serpapi/import-manual")
        ? 60000
        : 4000;
  let completed = false;

  const timer = setTimeout(() => {
    if (completed) return;
    completed = true;
    reply.status(504).send({ code: "timeout", message: "Request timed out" });
  }, timeoutMs);

  const clear = () => {
    if (completed) return;
    completed = true;
    clearTimeout(timer);
  };

  reply.raw.on("close", clear);
  reply.raw.on("finish", clear);
}

export function registerMiddleware(app: FastifyInstance): void {
  app.addHook("onRequest", async (request, reply) => {
    const traceId = request.headers["x-request-id"]
      ? String(request.headers["x-request-id"])
      : randomUUID();
    request.headers["x-request-id"] = traceId;
    reply.header("x-request-id", traceId);
    request.log = request.log.child({ traceId });

    if (!enforceRateLimit(request, reply)) {
      return reply; // response already sent
    }

    applyTimeout(request, reply);

    await chaosOnRequest(request, reply);
    if (reply.sent) return reply;
  });

  app.addHook("onResponse", async (request, reply) => {
    const route = request.routeOptions?.url ?? request.url;
    requestCounter.inc({
      method: request.method,
      route,
      status: String(reply.statusCode),
    });
  });

  app.addHook("onSend", async (request, reply, payload) =>
    chaosOnSend(request, reply, payload)
  );
}
