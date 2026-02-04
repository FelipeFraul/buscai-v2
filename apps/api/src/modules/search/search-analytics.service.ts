import {
  SearchAnalyticsQuerySchema,
  SearchAnalyticsResponseSchema,
} from "@buscai/shared-schema";
import { z } from "zod";

import { SearchRepository } from "./search.repository";

type SearchAnalyticsQuery = z.infer<typeof SearchAnalyticsQuerySchema>;
type SearchAnalyticsResponse = z.infer<typeof SearchAnalyticsResponseSchema>;

export class SearchAnalyticsService {
  constructor(private readonly searchRepository: SearchRepository) {}

  async getSearchAnalytics(_query: SearchAnalyticsQuery): Promise<SearchAnalyticsResponse> {
    const analytics = await this.searchRepository.getSearchAnalytics(_query);

    const items = analytics.items.map((row) => {
      const totalResults = Number(row.totalResults ?? 0);
      const paidResults = Number(row.paidResults ?? 0);
      const organicResults = Math.max(totalResults - paidResults, 0);
      const city = row.cityName
        ? row.cityState
          ? `${row.cityName} - ${row.cityState}`
          : row.cityName
        : "";

      return {
        searchId: row.searchId,
        createdAt: row.createdAt?.toISOString() ?? "",
        city,
        niche: row.nicheLabel ?? "",
        query: row.query ?? "",
        totalResults,
        paidResults,
        organicResults,
        totalCharged: Number(row.totalCharged ?? 0),
        hasClicks: Boolean(row.hasClicks && Number(row.hasClicks) > 0),
      };
    });

    return SearchAnalyticsResponseSchema.parse({
      items,
      total: analytics.total,
      page: analytics.page,
      pageSize: analytics.pageSize,
    });
  }
}
