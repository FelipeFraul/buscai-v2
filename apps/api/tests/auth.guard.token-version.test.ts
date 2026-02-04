import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../src/core/errors";
import { authGuard } from "../src/core/http/auth-guard";
import { AuthService } from "../src/modules/auth/auth.service";
import { AuthRepository } from "../src/modules/auth/auth.repository";
import { CompaniesRepository } from "../src/modules/companies/companies.repository";

const state = {
  user: {
    id: "user-1",
    name: "Tester",
    email: "tester@buscai.local",
    passwordHash: "secret",
    role: "admin" as const,
    tokenVersion: 0,
  },
  globalVersion: 0,
  refreshRecords: new Map<string, any>(),
};

const encode = (prefix: string, payload: Record<string, unknown>) =>
  `${prefix}.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.sig`;

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

vi.mock("../src/core/auth/jwt", () => ({
  signAccessToken: vi.fn((payload: Record<string, unknown>) =>
    encode("access", payload)
  ),
  verifyAccessToken: vi.fn((token: string) => decodeTokenPayload(token)),
  signRefreshToken: vi.fn((payload: Record<string, unknown>) =>
    encode("refresh", payload)
  ),
  verifyRefreshToken: vi.fn((token: string) => decodeTokenPayload(token)),
}));

vi.mock("../src/modules/auth/auth.repository", () => {
  class MockAuthRepository {
    async findByEmail(email: string) {
      return email === state.user.email ? state.user : undefined;
    }

    async findById(userId: string) {
      return userId === state.user.id ? state.user : undefined;
    }

    async getGlobalTokenVersion() {
      return state.globalVersion;
    }

    async createRefreshToken(params: any) {
      const record = {
        id: params.tokenId,
        userId: params.userId,
        companyId: params.companyId ?? null,
        tokenHash: params.tokenHash,
        expiresAt: params.expiresAt,
        createdAt: new Date(),
        updatedAt: new Date(),
        revokedAt: null,
      };
      state.refreshRecords.set(params.tokenId, record);
      return record;
    }

    async findRefreshTokenById(tokenId: string) {
      return state.refreshRecords.get(tokenId);
    }

    async revokeRefreshToken(tokenId: string) {
      const record = state.refreshRecords.get(tokenId);
      if (!record) return;
      record.revokedAt = new Date();
      record.updatedAt = new Date();
      state.refreshRecords.set(tokenId, record);
    }

    async bumpUserTokenVersion(userId: string) {
      if (userId !== state.user.id) return null;
      state.user.tokenVersion += 1;
      return state.user.tokenVersion;
    }

    async revokeAllTokensForUser(userId: string) {
      for (const [tokenId, record] of state.refreshRecords.entries()) {
        if (record.userId === userId && !record.revokedAt) {
          record.revokedAt = new Date();
          state.refreshRecords.set(tokenId, record);
        }
      }
    }

    async bumpGlobalTokenVersion() {
      state.globalVersion += 1;
      return state.globalVersion;
    }

    async revokeAllRefreshTokens() {
      for (const [tokenId, record] of state.refreshRecords.entries()) {
        if (!record.revokedAt) {
          record.revokedAt = new Date();
          state.refreshRecords.set(tokenId, record);
        }
      }
    }
  }

  return { AuthRepository: MockAuthRepository };
});

vi.mock("../src/modules/companies/companies.repository", () => {
  class MockCompaniesRepository {
    async listCompaniesByOwner() {
      return [];
    }
  }

  return { CompaniesRepository: MockCompaniesRepository };
});

describe("authGuard token version invalidation", () => {
  beforeEach(() => {
    state.user.tokenVersion = 0;
    state.globalVersion = 0;
    state.refreshRecords.clear();
  });

  it("rejects old access token after per-user token version bump", async () => {
    const service = new AuthService(
      new AuthRepository() as any,
      new CompaniesRepository() as any
    );

    const login = await service.login({
      email: state.user.email,
      password: "secret",
    });

    await service.invalidateTokens({ userId: state.user.id });

    await expect(
      authGuard({
        headers: { authorization: `Bearer ${login.accessToken}` },
      } as any)
    ).rejects.toMatchObject<AppError>({
      statusCode: 401,
      message: "Invalid or expired token",
    });
  });

  it("rejects old access token after global token version bump", async () => {
    const service = new AuthService(
      new AuthRepository() as any,
      new CompaniesRepository() as any
    );

    const login = await service.login({
      email: state.user.email,
      password: "secret",
    });

    await service.invalidateTokens();

    await expect(
      authGuard({
        headers: { authorization: `Bearer ${login.accessToken}` },
      } as any)
    ).rejects.toMatchObject<AppError>({
      statusCode: 401,
      message: "Invalid or expired token",
    });
  });
});
