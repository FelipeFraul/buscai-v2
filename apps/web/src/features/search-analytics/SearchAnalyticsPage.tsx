import { SearchList } from "@/features/search-analytics/SearchList";

export const SearchAnalyticsPage = () => (
  <div className="space-y-6">
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Search Analytics</h1>
      <p className="text-sm text-slate-600">Lista paginada de buscas com filtros.</p>
    </div>
    <SearchList />
  </div>
);
