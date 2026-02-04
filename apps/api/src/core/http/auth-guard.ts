import { FastifyRequest } from "fastify";

import { AuthRepository } from "../../modules/auth/auth.repository";
import { CompaniesRepository } from "../../modules/companies/companies.repository";
import { verifyAccessToken } from "../auth/jwt";
import { AppError } from "../errors";

const authRepository = new AuthRepository();
const companiesRepository = new CompaniesRepository();

export async function authGuard(request: FastifyRequest): Promise<void> {
  const authorization = request.headers.authorization;

  if (!authorization || !authorization.startsWith("Bearer ")) {
    throw new AppError(401, "Unauthorized");
  }

  const token = authorization.replace("Bearer ", "").trim();

  try {
    const { userId, tokenVersion, globalVersion } = verifyAccessToken(token);
    const user = await authRepository.findById(userId);

    if (!user) {
      throw new AppError(401, "Unauthorized");
    }

    const currentGlobalVersion = await authRepository.getGlobalTokenVersion();
    const currentTokenVersion = Number(user.tokenVersion ?? 0);
    if (tokenVersion !== currentTokenVersion || globalVersion !== currentGlobalVersion) {
      throw new AppError(401, "Unauthorized");
    }

    let companyId: string | undefined;
    const companies = await companiesRepository.listCompaniesByOwner(userId);
    companyId = companies[0]?.company.id;

    request.user = { id: userId, role: user.role, companyId };
  } catch {
    throw new AppError(401, "Invalid or expired token");
  }
}

export async function adminGuard(request: FastifyRequest): Promise<void> {
  if (request.user?.role !== "admin") {
    throw new AppError(403, "Forbidden");
  }
}
