import Fastify, { FastifyInstance } from "fastify";

import { AppError, isNotImplementedError } from "../errors";
import { logger } from "../logger";
import { ENV } from "../../config/env";

import { registerMiddleware } from "./middleware";
import { registerRoutes } from "./router";

type ErrorResponse = {
  error: {
    code: string;
    message: string;
    status: number;
  };
};

function buildErrorResponse(status: number, code: string, message: string): ErrorResponse {
  return {
    error: {
      code,
      message,
      status,
    },
  };
}

export async function createServer(): Promise<FastifyInstance> {
  const trustProxy = process.env.TRUST_PROXY === "true";
  const app = Fastify({
    logger: true,
    trustProxy,
    bodyLimit: ENV.HTTP_BODY_LIMIT_BYTES,
  });

  registerMiddleware(app);
  await registerRoutes(app);

  app.setErrorHandler((error, request, reply) => {
    if (isNotImplementedError(error)) {
      const status = 501;
      const payload = buildErrorResponse(status, "NOT_IMPLEMENTED", "Not implemented");
      logger.warn("Not implemented handler reached", {
        module: "http",
        route: request.url,
        method: request.method,
      });
      return reply.status(status).send(payload);
    }

    if (error instanceof AppError) {
      const status = error.statusCode ?? 400;
      const payload = buildErrorResponse(status, error.code ?? "APP_ERROR", error.message);
      logger.warn(error.message, {
        module: "http",
        route: request.url,
        method: request.method,
        status,
        code: error.code ?? "APP_ERROR",
      });
      return reply.status(status).send(payload);
    }

    const status = (error as { statusCode?: number }).statusCode ?? 500;
    const payload = buildErrorResponse(status, "UNEXPECTED_ERROR", "Erro interno");
    logger.error((error as Error).message ?? "Unexpected error", {
      module: "http",
      route: request.url,
      method: request.method,
      status,
      stack: (error as Error).stack,
    });
    return reply.status(status).send(payload);
  });

  return app;
}

export async function startServer(): Promise<void> {
  const server = await createServer();
  const port = ENV.PORT;
  await server.listen({ port, host: "0.0.0.0" });
  server.log.info(`BUSCAI API listening on port ${port}`);
}
