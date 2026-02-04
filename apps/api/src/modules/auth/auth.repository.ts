import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "../../core/database/client";

import { authTokenState, refreshTokens, users } from "./auth.schema";

export type UserRecord = typeof users.$inferSelect;
export type RefreshTokenRecord = typeof refreshTokens.$inferSelect;

export class AuthRepository {
  private readonly globalStateId = "global";

  async findByEmail(email: string): Promise<UserRecord | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return user;
  }

  async findById(userId: string): Promise<UserRecord | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    return user;
  }

  async createRefreshToken(params: {
    tokenId: string;
    userId: string;
    companyId?: string | null;
    tokenHash: string;
    ipHash?: string | null;
    uaHash?: string | null;
    expiresAt: Date;
    replacedByTokenId?: string;
  }): Promise<RefreshTokenRecord> {
    const [record] = await db
      .insert(refreshTokens)
      .values({
        id: params.tokenId,
        userId: params.userId,
        companyId: params.companyId ?? null,
        tokenHash: params.tokenHash,
        ipHash: params.ipHash ?? null,
        uaHash: params.uaHash ?? null,
        expiresAt: params.expiresAt,
        replacedByTokenId: params.replacedByTokenId,
      })
      .returning();

    return record;
  }

  async findRefreshTokenById(tokenId: string): Promise<RefreshTokenRecord | undefined> {
    const [record] = await db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.id, tokenId))
      .limit(1);

    return record;
  }

  async revokeRefreshToken(
    tokenId: string,
    replacedByTokenId?: string
  ): Promise<void> {
    await db
      .update(refreshTokens)
      .set({
        revokedAt: new Date(),
        replacedByTokenId: replacedByTokenId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(refreshTokens.id, tokenId));
  }

  async revokeAllTokensForUser(userId: string): Promise<void> {
    await db
      .update(refreshTokens)
      .set({
        revokedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
  }

  async createUser(user: {
    name: string;
    email: string;
    passwordHash: string;
    role: UserRecord["role"];
  }): Promise<UserRecord> {
    const [created] = await db
      .insert(users)
      .values({
        name: user.name,
        email: user.email,
        passwordHash: user.passwordHash,
        role: user.role,
      })
      .returning();

    return created;
  }

  async getGlobalTokenVersion(): Promise<number> {
    const [state] = await db
      .select()
      .from(authTokenState)
      .where(eq(authTokenState.id, this.globalStateId))
      .limit(1);

    if (state) {
      return Number(state.globalVersion ?? 0);
    }

    const [created] = await db
      .insert(authTokenState)
      .values({ id: this.globalStateId, globalVersion: 0, updatedAt: new Date() })
      .returning();

    return Number(created?.globalVersion ?? 0);
  }

  async bumpGlobalTokenVersion(): Promise<number> {
    await this.getGlobalTokenVersion();

    const [updated] = await db
      .update(authTokenState)
      .set({
        globalVersion: sql`${authTokenState.globalVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(authTokenState.id, this.globalStateId))
      .returning();

    return Number(updated?.globalVersion ?? 0);
  }

  async bumpUserTokenVersion(userId: string): Promise<number | null> {
    const [updated] = await db
      .update(users)
      .set({
        tokenVersion: sql`${users.tokenVersion} + 1`,
      })
      .where(eq(users.id, userId))
      .returning({ tokenVersion: users.tokenVersion });

    return updated ? Number(updated.tokenVersion ?? 0) : null;
  }

  async revokeAllRefreshTokens(): Promise<void> {
    await db
      .update(refreshTokens)
      .set({
        revokedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(isNull(refreshTokens.revokedAt));
  }
}
