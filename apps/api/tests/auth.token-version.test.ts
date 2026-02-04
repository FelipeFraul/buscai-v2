import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../src/core/errors";
import { logger } from "../src/core/logger";
import { AuthService } from "../src/modules/auth/auth.service";

const decodeTokenPayload = (token: string) => {
  const encoded = token.split(".")[1];
  return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
};

vi.mock("bcryptjs", () => {
  const compare = vi.fn(async (raw: string, hashed: string) => raw === hashed);
  const hash = vi.fn(async (raw: string) => raw);
  const defaultExport = { compare, hash };
  return { default: defaultExport, compare, hash };
});

vi.mock("../src/core/auth/jwt", () => {
  const encode = (prefix: string, payload: Record<string, unknown>) =>
    `${prefix}.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.sig`;

  return {
    signAccessToken: vi.fn((payload: Record<string, unknown>) =>
      encode("access", payload)
    ),
    signRefreshToken: vi.fn((payload: Record<string, unknown>) =>
      encode("refresh", payload)
    ),
    verifyRefreshToken: vi.fn((token: string) => {
      const payload = decodeTokenPayload(token);
      return {
        ...payload,
        exp:
          typeof payload.exp === "number"
            ? payload.exp
            : Math.floor(Date.now() / 1000) + 3600,
      };
    }),
    verifyAccessToken: vi.fn((token: string) => decodeTokenPayload(token)),
  };
});

vi.mock("../src/core/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("Auth token version invalidation", () => {
  const user = {
    id: "user-1",
    name: "Tester",
    email: "tester@buscai.local",
    passwordHash: "secret",
    role: "admin" as const,
    tokenVersion: 0,
  };

  let globalVersion = 0;
  const refreshRecords = new Map<string, any>();

  const authRepository = {
    findByEmail: vi.fn(async (email: string) => (email === user.email ? user : undefined)),
    findById: vi.fn(async (id: string) => (id === user.id ? user : undefined)),
    getGlobalTokenVersion: vi.fn(async () => globalVersion),
    createRefreshToken: vi.fn(async (params: any) => {
      const record = {
        id: params.tokenId,
        userId: params.userId,
        companyId: params.companyId ?? null,
        tokenHash: params.tokenHash,
        ipHash: params.ipHash ?? null,
        uaHash: params.uaHash ?? null,
        expiresAt: params.expiresAt,
        createdAt: new Date(),
        updatedAt: new Date(),
        revokedAt: null,
        replacedByTokenId: params.replacedByTokenId ?? null,
      };
      refreshRecords.set(params.tokenId, record);
      return record;
    }),
    findRefreshTokenById: vi.fn(async (tokenId: string) => refreshRecords.get(tokenId)),
    revokeRefreshToken: vi.fn(async (tokenId: string) => {
      const record = refreshRecords.get(tokenId);
      if (!record) return;
      record.revokedAt = new Date();
      record.updatedAt = new Date();
      refreshRecords.set(tokenId, record);
    }),
    bumpUserTokenVersion: vi.fn(async (userId: string) => {
      if (userId !== user.id) return null;
      user.tokenVersion += 1;
      return user.tokenVersion;
    }),
    revokeAllTokensForUser: vi.fn(async (userId: string) => {
      for (const [tokenId, record] of refreshRecords.entries()) {
        if (record.userId === userId && !record.revokedAt) {
          record.revokedAt = new Date();
          refreshRecords.set(tokenId, record);
        }
      }
    }),
    bumpGlobalTokenVersion: vi.fn(async () => {
      globalVersion += 1;
      return globalVersion;
    }),
    revokeAllRefreshTokens: vi.fn(async () => {
      for (const [tokenId, record] of refreshRecords.entries()) {
        if (!record.revokedAt) {
          record.revokedAt = new Date();
          refreshRecords.set(tokenId, record);
        }
      }
    }),
  };

  const companiesRepository = {
    listCompaniesByOwner: vi.fn(async () => []),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    user.tokenVersion = 0;
    globalVersion = 0;
    refreshRecords.clear();
  });

  it("rejects old refresh token after per-user token version bump", async () => {
    const service = new AuthService(authRepository as any, companiesRepository as any);

    const login = await service.login({
      email: user.email,
      password: "secret",
    });

    const tokenId = String((decodeTokenPayload(login.refreshToken) as { jti: string }).jti);
    expect(refreshRecords.has(tokenId)).toBe(true);

    await service.invalidateTokens({ userId: user.id });

    await expect(
      service.refresh({ refreshToken: login.refreshToken })
    ).rejects.toMatchObject<AppError>({
      statusCode: 401,
      message: "Invalid refresh token",
    });

    expect(authRepository.bumpUserTokenVersion).toHaveBeenCalledWith(user.id);
    expect(authRepository.revokeAllTokensForUser).toHaveBeenCalledWith(user.id);
  });

  it("rejects old refresh token after global token version bump", async () => {
    const service = new AuthService(authRepository as any, companiesRepository as any);

    const login = await service.login({
      email: user.email,
      password: "secret",
    });

    const tokenId = String((decodeTokenPayload(login.refreshToken) as { jti: string }).jti);
    expect(refreshRecords.has(tokenId)).toBe(true);

    await service.invalidateTokens();

    await expect(
      service.refresh({ refreshToken: login.refreshToken })
    ).rejects.toMatchObject<AppError>({
      statusCode: 401,
      message: "Invalid refresh token",
    });

    expect(authRepository.bumpGlobalTokenVersion).toHaveBeenCalled();
    expect(authRepository.revokeAllRefreshTokens).toHaveBeenCalled();
  });

  it("detects refresh token reuse and invalidates user tokens", async () => {
    const service = new AuthService(authRepository as any, companiesRepository as any);

    const login = await service.login({
      email: user.email,
      password: "secret",
    });

    const rotated = await service.refresh({ refreshToken: login.refreshToken });
    expect(rotated.refreshToken).toBeTruthy();

    await expect(
      service.refresh({ refreshToken: login.refreshToken })
    ).rejects.toMatchObject<AppError>({
      statusCode: 401,
      message: "Invalid refresh token",
    });

    expect(authRepository.bumpUserTokenVersion).toHaveBeenCalledWith(user.id);
    expect(authRepository.revokeAllTokensForUser).toHaveBeenCalledWith(user.id);
  });

  it("allows refresh on fingerprint mismatch (soft mode)", async () => {
    const service = new AuthService(authRepository as any, companiesRepository as any);

    const login = await service.login(
      { email: user.email, password: "secret" },
      { userAgent: "ua-a" }
    );
    const firstTokenId = String((decodeTokenPayload(login.refreshToken) as { jti: string }).jti);
    const firstRecord = refreshRecords.get(firstTokenId);
    expect(firstRecord?.ipHash).toBeNull();
    expect(firstRecord?.uaHash).toBeTruthy();

    const rotated = await service.refresh(
      { refreshToken: login.refreshToken },
      { userAgent: "ua-b" }
    );
    expect(rotated.refreshToken).toBeTruthy();

    const nextTokenId = String((decodeTokenPayload(rotated.refreshToken) as { jti: string }).jti);
    const secondRecord = refreshRecords.get(nextTokenId);
    expect(secondRecord?.ipHash).toBeNull();
    expect(secondRecord?.uaHash).toBeTruthy();
    expect(secondRecord?.uaHash).not.toBe(firstRecord?.uaHash);
    expect(logger.warn).toHaveBeenCalledWith(
      "auth.refresh.fingerprint_mismatch",
      expect.objectContaining({
        userId: user.id,
        reason: "fingerprint_mismatch",
        hasUaHash: true,
        mismatchUa: true,
      })
    );

    const warnPayload = (logger.warn as any).mock.calls[0][1];
    expect(JSON.stringify(warnPayload)).not.toContain("20.20.20.2");
    expect(JSON.stringify(warnPayload)).not.toContain("ua-b");
  });
});
