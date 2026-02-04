import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { ENV } from "../../config/env";
import { logger } from "../logger";

const connectionString = ENV.DATABASE_URL;

const sanitizedConfig = (() => {
  try {
    const url = new URL(connectionString);
    return {
      host: url.hostname,
      port: url.port || "5433",
      database: url.pathname.replace(/^\//, ""),
      user: url.username,
    };
  } catch {
    return null;
  }
})();

if (sanitizedConfig) {
  logger.info("[DB] Using database config (sanitized)", sanitizedConfig);
} else {
  logger.error("[DB] Failed to parse DATABASE_URL");
}

const pool = new Pool({ connectionString });
pool.on("error", (error) => {
  logger.error("[DB] Pool error", {
    code: (error as { code?: string }).code,
    message: (error as Error).message,
    stack: (error as Error).stack,
    config: sanitizedConfig ?? undefined,
  });
});

export const db = drizzle(pool);
export type DatabaseClient = typeof db;
