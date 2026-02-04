import { useState } from "react";

import { publicSearch } from "./api";
import type { PublicSearchResponse, PublicSearchResult } from "./types";

export const usePublicSearch = () => {
  const [results, setResults] = useState<PublicSearchResult[]>([]);
  const [searchId, setSearchId] = useState("");
  const [offeredBy, setOfferedBy] = useState<PublicSearchResponse["offeredBy"]>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async (payload: {
    text: string;
    city: string;
    niche?: string;
    limit?: number;
  }) => {
    setLoading(true);
    setError(null);
    try {
      const data = await publicSearch(payload);
      setResults(data.results);
      setSearchId(data.searchId);
      setOfferedBy(data.offeredBy);
    } catch (err) {
      setError("Erro ao buscar, tente novamente.");
      setResults([]);
      setSearchId("");
      setOfferedBy(undefined);
    } finally {
      setLoading(false);
    }
  };

  return {
    results,
    searchId,
    offeredBy,
    loading,
    error,
    search,
  };
};
