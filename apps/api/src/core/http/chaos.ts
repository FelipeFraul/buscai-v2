import type { FastifyReply, FastifyRequest } from "fastify";

import { ENV } from "../../config/env";

const CHAOS_ENABLED = ENV.CHAOS_ENABLED;
const CHAOS_LATENCY_MS = ENV.CHAOS_LATENCY_MS;
const CHAOS_ERROR_RATE = ENV.CHAOS_ERROR_RATE;
const CHAOS_DB_SLEEP_MS = ENV.CHAOS_DB_SLEEP_MS;

function shouldInjectError(): boolean {
  if (!CHAOS_ENABLED || CHAOS_ERROR_RATE <= 0) return false;
  return Math.random() < CHAOS_ERROR_RATE;
}

export async function chaosOnRequest(
  _request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!CHAOS_ENABLED) return;

  if (CHAOS_LATENCY_MS > 0) {
    await new Promise((resolve) => setTimeout(resolve, CHAOS_LATENCY_MS));
  }

  if (CHAOS_DB_SLEEP_MS > 0) {
    await new Promise((resolve) => setTimeout(resolve, CHAOS_DB_SLEEP_MS));
  }

  if (shouldInjectError()) {
    reply.status(503).send({ code: "chaos_error", message: "Injected chaos error" });
  }
}

export function chaosOnSend(
  _request: FastifyRequest,
  reply: FastifyReply,
  payload: unknown
): string | unknown {
  if (!CHAOS_ENABLED) return payload;
  return payload;
}
