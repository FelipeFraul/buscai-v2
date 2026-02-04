import {
  AuthLoginInputSchema,
  AuthRefreshInputSchema,
} from "@buscai/shared-schema";
import type { components, paths } from "@buscai/shared-schema/src/api-types";
import { createHash, randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";

import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../../core/auth/jwt";
import { AppError } from "../../core/errors";
import { logger } from "../../core/logger";
import { ENV } from "../../config/env";
import { CompaniesRepository } from "../companies/companies.repository";

import { AuthRepository, type RefreshTokenRecord, type UserRecord } from "./auth.repository";

type AuthLoginInput = z.infer<typeof AuthLoginInputSchema>;
type AuthRefreshInput = z.infer<typeof AuthRefreshInputSchema>;
type LoginResponse =
  paths["/auth/login"]["post"]["responses"]["200"]["content"]["application/json"];
type UserDto = components["schemas"]["User"];

const REFRESH_TOKEN_SALT_ROUNDS = ENV.NODE_ENV === "development" ? 4 : 10;
const FINGERPRINT_SALT = ENV.JWT_SECRET;
type TokenContext = {
  userAgent?: string | null;
};

export class AuthService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly companiesRepository: CompaniesRepository
  ) {}

  async login(payload: AuthLoginInput, context?: TokenContext): Promise<LoginResponse> {
    try {
      const user = await this.authRepository.findByEmail(payload.email);

      const isDevSeed =
        ENV.NODE_ENV === "development" &&
        Boolean(ENV.SEED_GLOBAL_ADMIN_EMAIL) &&
        payload.email === ENV.SEED_GLOBAL_ADMIN_EMAIL &&
        payload.password === ENV.SEED_GLOBAL_ADMIN_PASSWORD;

      const validPassword =
        user &&
        (isDevSeed ? true : await bcrypt.compare(payload.password, user.passwordHash));

      if (!user || !validPassword) {
        const error = new AppError(401, "Invalid credentials");
        error.name = "INVALID_CREDENTIALS";
        throw error;
      }

      const companyId = await this.resolveCompanyIdForUser(user.id);
      const globalVersion = await this.authRepository.getGlobalTokenVersion();
      const tokenVersion = Number(user.tokenVersion ?? 0);
      const accessToken = signAccessToken({
        id: user.id,
        role: user.role,
        companyId: companyId ?? undefined,
        tokenVersion,
        globalVersion,
      });
      const { token: refreshToken } = await this.issueRefreshToken(user.id, companyId, {
        tokenVersion,
        globalVersion,
      }, context);

      return {
        accessToken,
        refreshToken,
        user: this.mapToDto(user),
      };
    } catch (error) {
      logger.error("auth.login.unhandled", {
        email: payload.email,
        errorName: (error as Error)?.name,
        errorMessage: (error as Error)?.message,
        stack: (error as Error)?.stack,
      });
      throw error;
    }
  }

  async refresh(
    payload: AuthRefreshInput,
    context?: TokenContext
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const parsed = verifyRefreshToken(payload.refreshToken);
    const record = await this.authRepository.findRefreshTokenById(parsed.jti);

    if (!record) {
      throw new AppError(401, "Invalid refresh token");
    }

    if (record.revokedAt) {
      await this.handleRefreshTokenReuse(record.userId);
      throw new AppError(401, "Invalid refresh token");
    }
    this.ensureRefreshTokenIsValid(record);

    const matches = await bcrypt.compare(payload.refreshToken, record.tokenHash);
    if (!matches) {
      throw new AppError(401, "Invalid refresh token");
    }

    if (record.userId !== parsed.userId) {
      throw new AppError(401, "Invalid refresh token");
    }

    const user = await this.authRepository.findById(record.userId);

    if (!user) {
      throw new AppError(404, "User not found");
    }

    const globalVersion = await this.authRepository.getGlobalTokenVersion();
    const tokenVersion = Number(user.tokenVersion ?? 0);
    if (parsed.tokenVersion !== tokenVersion || parsed.globalVersion !== globalVersion) {
      await this.authRepository.revokeRefreshToken(record.id);
      throw new AppError(401, "Invalid refresh token");
    }

    const fingerprint = this.resolveFingerprint(context);
    const mismatchUa = Boolean(
      record.uaHash && fingerprint.uaHash && record.uaHash !== fingerprint.uaHash
    );
    if (mismatchUa) {
      logger.warn("auth.refresh.fingerprint_mismatch", {
        userId: record.userId,
        reason: "fingerprint_mismatch",
        hasUaHash: Boolean(record.uaHash),
        mismatchUa,
      });
    }

    const companyId = record.companyId ?? parsed.companyId ?? (await this.resolveCompanyIdForUser(user.id));
    const { token: nextRefreshToken, tokenId: nextTokenId } = await this.issueRefreshToken(user.id, companyId, {
      tokenVersion,
      globalVersion,
    }, context);
    await this.authRepository.revokeRefreshToken(record.id, nextTokenId);

    return {
      accessToken: signAccessToken({
        id: user.id,
        role: user.role,
        companyId: companyId ?? undefined,
        tokenVersion,
        globalVersion,
      }),
      refreshToken: nextRefreshToken,
    };
  }

  async logout(payload: AuthRefreshInput): Promise<void> {
    const parsed = verifyRefreshToken(payload.refreshToken);
    const record = await this.authRepository.findRefreshTokenById(parsed.jti);

    if (!record) {
      throw new AppError(401, "Invalid refresh token");
    }

    if (record.revokedAt) {
      throw new AppError(401, "Invalid refresh token");
    }

    this.ensureRefreshTokenIsValid(record);
    const matches = await bcrypt.compare(payload.refreshToken, record.tokenHash);
    if (!matches) {
      throw new AppError(401, "Invalid refresh token");
    }

    await this.authRepository.revokeRefreshToken(record.id);
  }

  async getCurrentUser(userId: string): Promise<UserDto> {
    const user = await this.authRepository.findById(userId);

    if (!user) {
      throw new AppError(404, "User not found");
    }

    return this.mapToDto(user);
  }

  async invalidateTokens(params?: { userId?: string | undefined }) {
    if (params?.userId) {
      const user = await this.authRepository.findById(params.userId);
      if (!user) {
        throw new AppError(404, "User not found");
      }
      const userTokenVersion = await this.authRepository.bumpUserTokenVersion(params.userId);
      await this.authRepository.revokeAllTokensForUser(params.userId);
      return {
        scope: "user" as const,
        userId: params.userId,
        userTokenVersion: Number(userTokenVersion ?? 0),
      };
    }

    const globalVersion = await this.authRepository.bumpGlobalTokenVersion();
    await this.authRepository.revokeAllRefreshTokens();
    return {
      scope: "global" as const,
      globalVersion,
    };
  }

  private mapToDto(user: UserRecord): UserDto {
    const role = user.role === "company_owner" ? "owner" : user.role;
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role,
    };
  }

  private ensureRefreshTokenIsValid(record: RefreshTokenRecord): void {
    const now = Date.now();
    if (record.expiresAt && record.expiresAt.getTime() <= now) {
      throw new AppError(401, "Refresh token expired");
    }
  }

  private async handleRefreshTokenReuse(userId: string): Promise<void> {
    const bumped = await this.authRepository.bumpUserTokenVersion(userId);
    await this.authRepository.revokeAllTokensForUser(userId);
    logger.warn("auth.refresh.token_reuse_detected", {
      userId,
      userTokenVersion: Number(bumped ?? 0),
      reason: "refresh_token_reuse",
    });
  }

  private async issueRefreshToken(
    userId: string,
    companyId?: string | null,
    versions?: { tokenVersion: number; globalVersion: number },
    context?: TokenContext
  ): Promise<{ tokenId: string; token: string; expiresAt: Date }> {
    const tokenId = randomUUID();
    const tokenVersion = versions?.tokenVersion ?? 0;
    const globalVersion = versions?.globalVersion ?? (await this.authRepository.getGlobalTokenVersion());
    const fingerprint = this.resolveFingerprint(context);
    const token = signRefreshToken({
      userId,
      jti: tokenId,
      companyId: companyId ?? undefined,
      tokenVersion,
      globalVersion,
    });
    const parsed = verifyRefreshToken(token);
    const expiresAt = parsed.exp ? new Date(parsed.exp * 1000) : new Date(Date.now());
    const tokenHash = await bcrypt.hash(token, REFRESH_TOKEN_SALT_ROUNDS);

    await this.authRepository.createRefreshToken({
      tokenId,
      userId,
      companyId: companyId ?? undefined,
      tokenHash,
      ipHash: fingerprint.ipHash,
      uaHash: fingerprint.uaHash,
      expiresAt,
      replacedByTokenId: undefined,
    });

    return { tokenId, token, expiresAt };
  }

  private resolveFingerprint(context?: TokenContext): { ipHash: string | null; uaHash: string | null } {
    const userAgent = (context?.userAgent ?? "").trim();
    return {
      ipHash: null,
      uaHash: userAgent ? this.hashFingerprint(userAgent) : null,
    };
  }

  private hashFingerprint(value: string): string {
    return createHash("sha256")
      .update(`${FINGERPRINT_SALT}:${value}`, "utf8")
      .digest("hex");
  }

  private async resolveCompanyIdForUser(userId: string): Promise<string | null> {
    const companies = await this.companiesRepository.listCompaniesByOwner(userId);
    return companies[0]?.company.id ?? null;
  }
}
