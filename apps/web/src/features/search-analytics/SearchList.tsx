import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { components } from "@/lib/api/types";

import { useSearchAnalytics } from "./useSearchAnalytics";

type SearchAnalyticsResponse =
  components["schemas"]["SearchAnalyticsResponse"];

export const SearchList = () => {
  const search = useSearchAnalytics();
  const [cityId, setCityId] = useState("");
  const [nicheId, setNicheId] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState("");
  const [pageSize, setPageSize] = useState("");

  const analytics = search.data as SearchAnalyticsResponse | undefined;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    search.mutate({
      cityId: cityId || undefined,
      nicheId: nicheId || undefined,
      companyId: companyId || undefined,
      from: from || undefined,
      to: to || undefined,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  };

  return (
    <div className="space-y-4">
      <form
        className="grid items-end gap-3 md:grid-cols-[repeat(7,minmax(0,1fr))]"
        onSubmit={handleSubmit}
      >
        <Input
          placeholder="De (data/hora ISO)"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
        />
        <Input
          placeholder="Até (data/hora ISO)"
          value={to}
          onChange={(event) => setTo(event.target.value)}
        />
        <Input
          placeholder="ID da cidade"
          value={cityId}
          onChange={(event) => setCityId(event.target.value)}
        />
        <Input
          placeholder="ID do nicho"
          value={nicheId}
          onChange={(event) => setNicheId(event.target.value)}
        />
        <Input
          placeholder="ID da empresa"
          value={companyId}
          onChange={(event) => setCompanyId(event.target.value)}
        />
        <Input
          placeholder="Página"
          value={page}
          onChange={(event) => setPage(event.target.value)}
        />
        <Input
          placeholder="Itens/página"
          value={pageSize}
          onChange={(event) => setPageSize(event.target.value)}
        />
        <Button type="submit" disabled={search.isPending}>
          {search.isPending ? "Consultando..." : "Buscar"}
        </Button>
      </form>

      {search.error ? (
        <p className="text-sm text-red-600">
          Falha ao consultar resultados. Tente novamente.
        </p>
      ) : null}

      {analytics ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
            <span>Total: {analytics.total}</span>
            <span>
              Página: {analytics.page} /{" "}
              {Math.max(Math.ceil(analytics.total / analytics.pageSize), 1)}
            </span>
            <span>Itens por página: {analytics.pageSize}</span>
          </div>
          <div className="overflow-hidden rounded-md border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">
                    Busca
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">
                    Cidade
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">
                    Nicho
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">
                    Resultados (P/O)
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">
                    Cobrança total
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">
                    Cliques?
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {analytics.items.map((item) => (
                  <tr key={item.searchId}>
                    <td className="px-3 py-2">
                      <div className="font-semibold text-slate-900">
                        {item.query}
                      </div>
                      <div className="text-xs text-slate-500">
                        {new Date(item.createdAt).toLocaleString()}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-slate-700">{item.city}</td>
                    <td className="px-3 py-2 text-slate-700">{item.niche}</td>
                    <td className="px-3 py-2 text-slate-700">
                      {item.totalResults}{" "}
                      <span className="text-xs text-slate-500">
                        ({item.paidResults} pagos / {item.organicResults} org)
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      R$ {item.totalCharged?.toFixed(2) ?? "0.00"}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {item.hasClicks ? "Sim" : "Não"}
                    </td>
                  </tr>
                ))}
                {analytics.items.length === 0 ? (
                  <tr>
                    <td
                      className="px-3 py-4 text-sm text-slate-500"
                      colSpan={6}
                    >
                      Nenhum resultado encontrado para os filtros informados.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
};
