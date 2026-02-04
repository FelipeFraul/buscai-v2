import type { components } from "@buscai/shared-schema/src/api-types";

import type { CompanySummary } from "../search/search.repository";

export function mapCompanySummaryToDto(
  summary: CompanySummary
): components["schemas"]["Company"] {
  return {
    id: summary.company.id,
    tradeName: summary.company.tradeName,
    legalName: summary.company.legalName ?? undefined,
    city: summary.city
      ? {
          id: summary.city.id,
          name: summary.city.name,
          state: summary.city.state,
          isActive: summary.city.isActive ?? undefined,
        }
      : undefined,
    niches: summary.niches.map((niche) => ({
      id: niche.id,
      label: niche.label,
      slug: niche.slug,
      isActive: niche.isActive ?? undefined,
    })),
    status: summary.company.status,
    channels: {
      phone: summary.company.phone ?? undefined,
      whatsapp: summary.company.whatsapp ?? undefined,
      address: summary.company.address ?? undefined,
      openingHours: summary.company.openingHours ?? undefined,
      latitude: undefined,
      longitude: undefined,
    },
    createdAt: summary.company.createdAt?.toISOString(),
  };
}
