import axios from "axios";

import { ENV } from "../../config/env";

export type SerpapiItem = {
  name?: string;
  phone?: string;
  address?: string;
  website?: string;
  raw: unknown;
};

export class SerpapiClient {
  async search(query: string, limit: number, apiKey?: string) {
    const response = await axios.get(ENV.SERPAPI_BASE_URL, {
      params: {
        api_key: apiKey ?? ENV.SERPAPI_API_KEY,
        engine: ENV.SERPAPI_ENGINE,
        q: query,
        num: limit,
      },
      timeout: 30_000,
    });

    const localResults = Array.isArray(response.data?.local_results)
      ? response.data.local_results
      : [];

    return localResults.slice(0, limit).map((item: any) => ({
      name: item.title ?? item.name ?? item.business_name,
      phone: item.phone ?? item.formatted_phone_number,
      address: item.address ?? item.vicinity ?? item.formatted_address,
      website: item.website ?? item.url,
      raw: item,
    }));
  }
}
