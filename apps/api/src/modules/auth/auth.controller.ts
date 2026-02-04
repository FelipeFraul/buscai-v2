import {
  AuthLoginInputSchema,
  AuthRefreshInputSchema,
} from "@buscai/shared-schema";
import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { AppError } from "../../core/errors";
import { incrementCounter } from "../../core/metrics";
import { ENV } from "../../config/env";
import { signAccessToken, signRefreshToken } from "../../core/auth/jwt";

import { AuthService } from "./auth.service";

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private getTokenContext(request: FastifyRequest): { userAgent: string | null } {
    const userAgentHeader = request.headers["user-agent"];
    const userAgent = Array.isArray(userAgentHeader) ? userAgentHeader[0] : userAgentHeader;
    return {
      userAgent: typeof userAgent === "string" ? userAgent : null,
    };
  }

  async login(request: FastifyRequest, reply: FastifyReply) {
    const startedAt = Date.now();
    const body = request.body ?? {};
    const logFinish = (status: number) => {
      request.log.info(
        {
          email: (body as { email?: string }).email ?? "unknown",
          status,
          responseTimeMs: Date.now() - startedAt,
        },
        "auth.login.finish"
      );
    };
    request.log.info(
      {
        email: (body as { email?: string }).email ?? "unknown",
      },
      "auth.login.start"
    );

    // Dev fallback user
    if (
      ENV.NODE_ENV === "development" &&
      (body as { email?: string }).email === "dev@buscai.local" &&
      (body as { password?: string }).password === "dev123"
    ) {
      const userId = "dev-user-id";
      const companyId = "dev-company-id";
      const accessToken = signAccessToken({
        id: userId,
        role: "company_owner",
        companyId,
        tokenVersion: 0,
        globalVersion: 0,
      });
      const refreshToken = signRefreshToken({
        userId,
        jti: "dev-refresh-id",
        companyId,
        tokenVersion: 0,
        globalVersion: 0,
      });
      incrementCounter("auth_login_success_total");
      logFinish(200);
      return reply.send({
        accessToken,
        refreshToken,
        user: {
          id: userId,
          companyId,
          name: "Dev Empresa BUSCAÍ",
          email: "dev@buscai.local",
          role: "owner",
        },
      });
    }

    const parsed = AuthLoginInputSchema.safeParse(body);
    if (!parsed.success) {
      logFinish(400);
      return reply.status(400).send({ message: "Email e senha são obrigatórios" });
    }

    try {
      const response = await this.authService.login(parsed.data, this.getTokenContext(request));
      incrementCounter("auth_login_success_total");
      logFinish(200);
      return reply.send(response);
    } catch (error) {
      incrementCounter("auth_login_fail_total");
      if (error instanceof AppError) {
        logFinish(error.statusCode ?? 400);
        return reply
          .status(error.statusCode)
          .send({ code: error.name ?? "APP_ERROR", message: error.message });
      }
      request.log.error(
        {
          err: error,
          email: (body as { email?: string }).email ?? "unknown",
          errorName: (error as Error)?.name,
          errorMessage: (error as Error)?.message,
          stack: (error as Error)?.stack,
        },
        "auth.login.error"
      );
      logFinish(500);
      return reply.status(500).send({ message: "Erro interno ao fazer login" });
    }
  }

  async refresh(request: FastifyRequest, reply: FastifyReply) {
    const payload = AuthRefreshInputSchema.parse(request.body ?? {});
    const response = await this.authService.refresh(payload, this.getTokenContext(request));
    return reply.send(response);
  }

  async logout(request: FastifyRequest, reply: FastifyReply) {
    const payload = AuthRefreshInputSchema.parse(request.body ?? {});
    await this.authService.logout(payload);
    return reply.status(204).send();
  }

  async me(request: FastifyRequest, reply: FastifyReply) {
    if (!request.user?.id) {
      throw new AppError(401, "Unauthorized");
    }

    const user = await this.authService.getCurrentUser(request.user.id);
    return reply.send(user);
  }

  async invalidateTokens(request: FastifyRequest, reply: FastifyReply) {
    const payload = z
      .object({
        userId: z.string().uuid().optional(),
      })
      .parse(request.body ?? {});

    const result = await this.authService.invalidateTokens({ userId: payload.userId });
    return reply.send(result);
  }
}
