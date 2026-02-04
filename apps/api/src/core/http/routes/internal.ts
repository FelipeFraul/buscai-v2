import { FastifyInstance } from "fastify";

import { ENV } from "../../../config/env";
import { adminGuard, authGuard } from "../auth-guard";
import { logger } from "../../logger";
import { db } from "../../database/client";
import { getMetricsSnapshot } from "../../metrics";
import { cities, niches } from "../../../modules/catalog/catalog.schema";
import { users } from "../../../modules/auth/auth.schema";
import { count, eq } from "drizzle-orm";

export async function registerInternalRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/internal/metrics",
    { preHandler: [authGuard, adminGuard] },
    async (_request, reply) => {
      const metrics = getMetricsSnapshot();
      reply.header("Content-Type", "application/json");
      return reply.send(metrics);
    }
  );

  app.get("/internal/health", async (_request, reply) => {
    const now = new Date();
    let dbStatus: "ok" | "down" = "ok";
    let bootstrapStatus: "ready" | "not_ready" = "not_ready";

    try {
      await db.execute("select 1");

      const [adminCountRows, cityCountRows, nicheCountRows] = await Promise.all([
        db.select({ value: count() }).from(users).where(eq(users.role, "admin")),
        db.select({ value: count() }).from(cities),
        db.select({ value: count() }).from(niches),
      ]);

      const hasAdmin = Number(adminCountRows[0]?.value ?? 0) > 0;
      const hasCity = Number(cityCountRows[0]?.value ?? 0) > 0;
      const hasNiche = Number(nicheCountRows[0]?.value ?? 0) > 0;
      bootstrapStatus = hasAdmin && hasCity && hasNiche ? "ready" : "not_ready";
    } catch (error) {
      dbStatus = "down";
      logger.error("Healthcheck: database down", {
        module: "health",
        error: (error as Error).message,
      });
    }

    const services = {
      database: dbStatus,
      bootstrap: bootstrapStatus,
      whatsapp_webhook: ENV.WHATSAPP_WEBHOOK_SECRET ? "ok" : "down",
      whatsapp_api: ENV.WHATSAPP_API_TOKEN ? "ok" : "down",
    } as const;

    const overall = dbStatus === "down" || bootstrapStatus === "not_ready" ? "degraded" : "ok";

    const payload = {
      status: overall,
      uptime: process.uptime(),
      timestamp: now.toISOString(),
      version: process.env.BUILD_ID ?? "unknown",
      services,
    };

    return reply.send(payload);
  });
}
