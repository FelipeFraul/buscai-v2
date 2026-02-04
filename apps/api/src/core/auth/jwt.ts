import jwt from "jsonwebtoken";

import { ENV } from "../../config/env";

const ACCESS_TOKEN_SECRET = ENV.JWT_SECRET;
const REFRESH_TOKEN_SECRET = ENV.REFRESH_SECRET ?? ENV.JWT_SECRET;

export type AuthAccessTokenPayload = {
  sub: string;
  userId: string;
  role: string;
  companyId?: string;
  tokenVersion: number;
  globalVersion: number;
  iat: number;
  exp: number;
};

export type AuthRefreshTokenPayload = {
  sub: string;
  userId: string;
  jti: string;
  companyId?: string;
  tokenVersion: number;
  globalVersion: number;
  iat: number;
  exp: number;
};

export function signAccessToken(user: {
  id: string;
  role: string;
  companyId?: string;
  tokenVersion: number;
  globalVersion: number;
}): string {
  const payload = {
    sub: user.id,
    userId: user.id,
    role: user.role,
    companyId: user.companyId,
    tokenVersion: user.tokenVersion,
    globalVersion: user.globalVersion,
  };

  return jwt.sign(payload, ACCESS_TOKEN_SECRET, { expiresIn: "30m" });
}

export function verifyAccessToken(token: string): AuthAccessTokenPayload {
  return jwt.verify(token, ACCESS_TOKEN_SECRET) as AuthAccessTokenPayload;
}

export function signRefreshToken(payload: {
  userId: string;
  jti: string;
  companyId?: string;
  tokenVersion: number;
  globalVersion: number;
}): string {
  const refreshPayload = {
    sub: payload.userId,
    userId: payload.userId,
    jti: payload.jti,
    companyId: payload.companyId,
    tokenVersion: payload.tokenVersion,
    globalVersion: payload.globalVersion,
  };

  return jwt.sign(refreshPayload, REFRESH_TOKEN_SECRET, { expiresIn: "30d" });
}

export function verifyRefreshToken(token: string): AuthRefreshTokenPayload {
  return jwt.verify(token, REFRESH_TOKEN_SECRET) as AuthRefreshTokenPayload;
}
