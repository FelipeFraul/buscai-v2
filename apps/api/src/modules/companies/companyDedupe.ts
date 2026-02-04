import { and, or, sql } from "drizzle-orm";

import { db } from "../../core/database/client";
import { companies } from "./companies.schema";
import {
  normalizeAddressLine,
  normalizeName,
  normalizePhoneToE164BR,
  normalizeWebsite,
  toDigits,
} from "./companyNormalization";

export type CompanyDedupeInput = {
  name?: string | null;
  addressLine?: string | null;
  phoneE164?: string | null;
  whatsappE164?: string | null;
  website?: string | null;
};

export type CompanyDedupeHit = {
  id: string;
  name: string;
  addressLine: string | null;
  phoneE164: string | null;
  whatsappE164: string | null;
  website: string | null;
  status: string;
  cityId: string;
};

export const findDedupeHits = async (input: CompanyDedupeInput): Promise<CompanyDedupeHit[]> => {
  const phoneE164 = normalizePhoneToE164BR(input.phoneE164);
  const whatsappE164 = normalizePhoneToE164BR(input.whatsappE164);
  const website = normalizeWebsite(input.website);
  const name = normalizeName(input.name);
  const addressLine = normalizeAddressLine(input.addressLine);

  const conditions = [];

  const phoneDigits = toDigits(phoneE164);
  if (phoneDigits) {
    conditions.push(
      sql`regexp_replace(coalesce(${companies.phone}, ''), '\\D', '', 'g') = ${phoneDigits}`
    );
  }

  const whatsappDigits = toDigits(whatsappE164);
  if (whatsappDigits) {
    conditions.push(
      sql`regexp_replace(coalesce(${companies.whatsapp}, ''), '\\D', '', 'g') = ${whatsappDigits}`
    );
  }

  if (website) {
    conditions.push(
      sql`regexp_replace(lower(coalesce(${companies.website}, '')), '/+$', '') = ${website}`
    );
  }

  if (name && addressLine) {
    conditions.push(
      and(
        sql`lower(coalesce(${companies.tradeName}, '')) = ${name}`,
        sql`lower(coalesce(${companies.address}, '')) = ${addressLine.toLowerCase()}`
      )
    );
  }

  if (!conditions.length) {
    return [];
  }

  return db
    .select({
      id: companies.id,
      name: companies.tradeName,
      addressLine: companies.address,
      phoneE164: companies.phone,
      whatsappE164: companies.whatsapp,
      website: companies.website,
      status: companies.status,
      cityId: companies.cityId,
    })
    .from(companies)
    .where(or(...conditions))
    .limit(25);
};
