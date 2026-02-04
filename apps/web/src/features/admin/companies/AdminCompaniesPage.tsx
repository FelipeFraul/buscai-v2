import { Link, useSearchParams } from "react-router-dom";
import { useMemo } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useCities, useNiches } from "@/features/catalog/useCatalog";
import { useAdminCompanies } from "@/features/admin/companies/api";

const pageSizeOptions = [10, 25, 50] as const;

export const AdminCompaniesPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const citiesQuery = useCities();
  const nichesQuery = useNiches();

  const cityMap = useMemo(() => {
    return new Map((citiesQuery.data ?? []).map((city) => [city.id, `${city.name} / ${city.state}`]));
  }, [citiesQuery.data]);

  const nicheMap = useMemo(() => {
    return new Map((nichesQuery.data ?? []).map((niche) => [niche.id, niche.label]));
  }, [nichesQuery.data]);

  const status = searchParams.get("status") ?? "";
  const cityId = searchParams.get("cityId") ?? "";
  const nicheId = searchParams.get("nicheId") ?? "";
  const q = searchParams.get("q") ?? "";
  const page = Math.max(Number(searchParams.get("page") ?? 1), 1);
  const rawLimit = Number(searchParams.get("limit") ?? 10);
  const limit = pageSizeOptions.includes(rawLimit as (typeof pageSizeOptions)[number])
    ? rawLimit
    : 10;

  const companiesQuery = useAdminCompanies({
    status: status || undefined,
    cityId: cityId || undefined,
    nicheId: nicheId || undefined,
    q: q || undefined,
    page,
    limit,
  });

  const handleParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (!value) {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    if (key !== "page") {
      next.set("page", "1");
    }
    setSearchParams(next);
  };

  const total = companiesQuery.data?.total ?? 0;
  const totalPages = Math.max(Math.ceil(total / limit), 1);

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Catalogo publicavel</h1>
            <p className="text-sm text-slate-500">Empresas prontas para publicacao.</p>
          </div>
          <Button asChild>
            <Link to="/admin/companies/new">Nova empresa</Link>
          </Button>
        </div>

        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="grid gap-4 md:grid-cols-4">
            <label className="text-sm text-slate-600">
              Status
              <select
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                value={status}
                onChange={(event) => handleParam("status", event.target.value)}
              >
                <option value="">Todos</option>
                <option value="draft">Draft</option>
                <option value="pending">Pending</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </select>
            </label>
            <label className="text-sm text-slate-600">
              Cidade
              <select
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                value={cityId}
                onChange={(event) => handleParam("cityId", event.target.value)}
              >
                <option value="">Todas</option>
                {(citiesQuery.data ?? []).map((city) => (
                  <option key={city.id} value={city.id}>
                    {city.name} / {city.state}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-slate-600">
              Nicho
              <select
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                value={nicheId}
                onChange={(event) => handleParam("nicheId", event.target.value)}
              >
                <option value="">Todos</option>
                {(nichesQuery.data ?? []).map((niche) => (
                  <option key={niche.id} value={niche.id}>
                    {niche.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-slate-600">
              Busca
              <Input
                className="mt-1"
                value={q}
                onChange={(event) => handleParam("q", event.target.value)}
                placeholder="Nome, telefone..."
              />
            </label>
          </div>
        </section>

        <section className="rounded-2xl bg-white p-6 shadow-sm">
          {companiesQuery.isLoading ? (
            <p className="text-sm text-slate-500">Carregando empresas...</p>
          ) : companiesQuery.isError ? (
            <div className="text-sm text-slate-500">
              Nao foi possivel carregar.
              <Button variant="outline" className="ml-3" onClick={() => companiesQuery.refetch()}>
                Tentar novamente
              </Button>
            </div>
          ) : (
            <>
              <div className="overflow-hidden rounded-xl border border-slate-100">
                <table className="w-full text-left text-sm">
                  <thead className="border-b bg-slate-50">
                    <tr>
                      <th className="px-4 py-3">Nome</th>
                      <th className="px-4 py-3">Cidade</th>
                      <th className="px-4 py-3">Nicho</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Contato</th>
                      <th className="px-4 py-3">Origem</th>
                      <th className="px-4 py-3">Qualidade</th>
                      <th className="px-4 py-3">Acao</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(companiesQuery.data?.items ?? []).map((company) => (
                      <tr key={company.id} className="border-b bg-white">
                        <td className="px-4 py-3">{company.name}</td>
                        <td className="px-4 py-3">{cityMap.get(company.cityId) ?? company.cityId}</td>
                        <td className="px-4 py-3">{company.nicheId ? nicheMap.get(company.nicheId) ?? company.nicheId : "—"}</td>
                        <td className="px-4 py-3">{company.status}</td>
                        <td className="px-4 py-3">
                          {company.phoneE164 ?? company.whatsappE164 ?? "—"}
                        </td>
                        <td className="px-4 py-3">{company.origin}</td>
                        <td className="px-4 py-3">{company.qualityScore}</td>
                        <td className="px-4 py-3">
                          <Button asChild size="sm" variant="outline">
                            <Link to={`/admin/companies/${company.id}`}>Editar</Link>
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {!companiesQuery.data?.items?.length && (
                      <tr>
                        <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                          Nenhuma empresa encontrada.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
                <span>
                  Total: {total} | Pagina {page} de {totalPages}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleParam("page", String(Math.max(page - 1, 1)))}
                    disabled={page <= 1}
                  >
                    Anterior
                  </Button>
                  <select
                    className="rounded-md border border-slate-200 px-2 py-1 text-sm"
                    value={String(limit)}
                    onChange={(event) => handleParam("limit", event.target.value)}
                  >
                    {pageSizeOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}/pagina
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleParam("page", String(Math.min(page + 1, totalPages)))}
                    disabled={page >= totalPages}
                  >
                    Proximo
                  </Button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
};
