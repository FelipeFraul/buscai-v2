import { startServer } from "./core/http/server";
import { logger } from "./core/logger";
import { ENV } from "./config/env";

function logDatabaseConfig(): void {
  try {
    const url = new URL(ENV.DATABASE_URL);
    logger.info("[DB] Using database config (sanitized)", {
      host: url.hostname,
      port: url.port || "5433",
      database: url.pathname.replace(/^\//, ""),
      user: url.username,
    });
  } catch (error) {
    logger.error("[DB] Failed to parse DATABASE_URL", { error: (error as Error).message });
  }
}

logDatabaseConfig();

startServer().catch((error) => {
  logger.error("Failed to start BUSCAI API server", { error: (error as Error).message });
  process.exit(1);
});
