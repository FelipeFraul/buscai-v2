import { companies } from "../companies/companies.schema";
import { db } from "../../core/database/client";
import { claimRequests } from "./claims.schema";
import { and, eq, ilike, or, sql } from "drizzle-orm";

export type CandidateResult = {
  companyId: string;
  nome: string;
  cityId: string;
  serpPhone?: string | null;
  matchReason: "both" | "phone" | "name";
};

export type ClaimRequestRecord = {
  id: string;
  companyId: string;
  userId: string;
  method: ClaimMethod;
  status: string;
  requestedPhone: string | null;
  serpPhone: string | null;
};

const normalizePhone = (value: string | null | undefined): string | null => {
  if (!value) {
    return null;
  }
  const digits = value.replace(/\D/g, "");
  return digits || null;
};

export class ClaimsRepository {
  async findCandidates({
    cityId,
    q,
  }: {
    cityId: string;
    q?: string;
  }): Promise<CandidateResult[]> {
    const filters: any[] = [eq(companies.cityId, cityId)];
    const normalizedQuery = q?.trim();
    let digits: string | null = null;

    if (normalizedQuery) {
      digits = normalizedQuery.replace(/\D/g, "");
      const conditions = [
        ilike(companies.tradeName, `${normalizedQuery}%`),
        ilike(companies.tradeName, `%${normalizedQuery}%`),
      ];

      if (digits.length >= 8) {
        const phoneMatch = sql`
          regexp_replace(coalesce(${companies.whatsapp}, ''), '\\D', '', 'g') = ${digits}
          OR regexp_replace(coalesce(${companies.phone}, ''), '\\D', '', 'g') = ${digits}
        `;
        conditions.push(phoneMatch);
      }

      filters.push(or(...conditions));
    }

    const rows = await db
      .select({
        id: companies.id,
        tradeName: companies.tradeName,
        cityId: companies.cityId,
        whatsapp: companies.whatsapp,
        phone: companies.phone,
      })
      .from(companies)
      .where(and(...filters))
      .limit(40);

    const scored = rows
      .map((row) => {
        const serpPhone = row.whatsapp ?? row.phone ?? null;
        const serpDigits = normalizePhone(serpPhone);
        const nameMatch =
          Boolean(normalizedQuery) &&
          row.tradeName.toLowerCase().includes(normalizedQuery!.toLowerCase());
        const phoneMatch =
          Boolean(digits) && serpDigits !== null && serpDigits === digits;
        const matchReason: CandidateResult["matchReason"] =
          nameMatch && phoneMatch ? "both" : phoneMatch ? "phone" : "name";

        return {
          companyId: row.id,
          nome: row.tradeName,
          cityId: row.cityId,
          serpPhone,
          matchReason,
        };
      })
      .sort((a, b) => {
        const order = { both: 0, phone: 1, name: 2 };
        const diff = order[a.matchReason] - order[b.matchReason];
        if (diff !== 0) return diff;
        return a.nome.localeCompare(b.nome);
      })
      .slice(0, 20);

    return scored.map((item) => ({
      ...item,
      serpPhone: item.serpPhone,
    }));
  }

  async getCompanySerpPhone(companyId: string): Promise<string | null> {
    const [row] = await db
      .select({
        whatsapp: companies.whatsapp,
        phone: companies.phone,
      })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    if (!row) {
      return null;
    }

    return row.whatsapp ?? row.phone ?? null;
  }

  async findPendingRequest(companyId: string, userId: string) {
    const [record] = await db
      .select()
      .from(claimRequests)
      .where(
        and(
          eq(claimRequests.companyId, companyId),
          eq(claimRequests.userId, userId),
          eq(claimRequests.status, "pending")
        )
      )
      .orderBy(claimRequests.createdAt.desc())
      .limit(1);

    return record ?? null;
  }

  async createRequest(data: {
    companyId: string;
    userId: string;
    method: ClaimMethod;
    requestedPhone: string | null;
    serpPhone: string | null;
  }) {
    const [created] = await db
      .insert(claimRequests)
      .values({
        companyId: data.companyId,
        userId: data.userId,
        method: data.method,
        status: "pending",
        requestedPhone: data.requestedPhone,
        serpPhone: data.serpPhone,
      })
      .returning({
        id: claimRequests.id,
        method: claimRequests.method,
        status: claimRequests.status,
      });

    return created;
  }

  async getRequestById(requestId: string) {
    const [record] = await db
      .select()
      .from(claimRequests)
      .where(eq(claimRequests.id, requestId))
      .limit(1);

    return record ?? null;
  }

  async updateNotes(requestId: string, notes: string) {
    await db
      .update(claimRequests)
      .set({
        notes,
        updatedAt: new Date(),
      })
      .where(eq(claimRequests.id, requestId));
  }
}
