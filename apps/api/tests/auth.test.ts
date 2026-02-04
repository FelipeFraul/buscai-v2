import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../src/modules/auth/auth.service";
import { AppError } from "../src/core/errors";

vi.mock("bcryptjs", () => {
  const compare = vi.fn(async (pw: string, hash: string) => pw === hash);
  const hash = vi.fn(async (pw: string) => pw);
  const defaultExport = { compare, hash };
  return { default: defaultExport, compare, hash };
});

vi.mock("../src/core/auth/jwt", () => ({
  signAccessToken: vi.fn(() => "signed-token"),
  signRefreshToken: vi.fn(() => "refresh-token"),
  verifyRefreshToken: vi.fn(() => ({
    userId: "user-1",
    jti: "jti-1",
    exp: Math.floor(Date.now() / 1000) + 60,
  })),
  verifyAccessToken: vi.fn(() => ({ userId: "user-1" })),
}));

const user = {
  id: "user-1",
  name: "Tester",
  email: "tester@buscai.local",
  passwordHash: "secret",
  role: "admin",
};

const demoUser = {
  id: "demo-user-id",
  name: "Demo User",
  email: "demo@buscai.app",
  passwordHash: "demo123",
  role: "company_owner",
};

const makeAuthRepository = () => {
  const repo = {
    findByEmail: vi.fn(async (email: string) => {
      if (email === user.email) return user;
      if (email === demoUser.email) return demoUser;
      return undefined;
    }),
    findById: vi.fn(async (id: string) => {
      if (id === user.id) return user;
      if (id === demoUser.id) return demoUser;
      return undefined;
    }),
    createUser: vi.fn(),
    getGlobalTokenVersion: vi.fn(async () => 0),
    createRefreshToken: vi.fn(async (params: any) => ({
      id: params.tokenId,
      userId: params.userId,
      companyId: params.companyId ?? null,
      tokenHash: params.tokenHash,
      expiresAt: params.expiresAt,
      createdAt: new Date(),
      updatedAt: new Date(),
      revokedAt: null,
      replacedByTokenId: params.replacedByTokenId ?? null,
    })),
  };

  return repo;
};

const makeCompaniesRepository = () => ({
  listCompaniesByOwner: vi.fn(async () => []),
});

describe("AuthService", () => {
  let service: AuthService;
  let authRepository: ReturnType<typeof makeAuthRepository>;

  beforeEach(() => {
    vi.clearAllMocks();
    authRepository = makeAuthRepository();
    service = new AuthService(
      authRepository as any,
      makeCompaniesRepository() as any
    );
  });

  it("authenticates with correct credentials", async () => {
    const res = await service.login({ email: user.email, password: "secret" });
    expect(res.accessToken).toBe("signed-token");
    expect(res.user?.email).toBe(user.email);
    expect(authRepository.createUser).not.toHaveBeenCalled();
  });

  it("authenticates demo user that already exists without creating it", async () => {
    const res = await service.login({
      email: demoUser.email,
      password: demoUser.passwordHash,
    });
    expect(res.accessToken).toBe("signed-token");
    expect(res.user?.email).toBe(demoUser.email);
    expect(authRepository.createUser).not.toHaveBeenCalled();
  });

  it("rejects invalid credentials", async () => {
    await expect(
      service.login({ email: user.email, password: "wrong" })
    ).rejects.toBeInstanceOf(AppError);
    expect(authRepository.createUser).not.toHaveBeenCalled();
  });

  it("returns current user", async () => {
    const res = await service.getCurrentUser(user.id);
    expect(res.id).toBe(user.id);
  });
});
