import { useMemo, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useCities } from "@/features/catalog/useCatalog";
import { useProductSearch } from "@/features/public/hooks/useProductSearch";
import type { components } from "@/lib/api/types";

type City = components["schemas"]["City"];
type ProductSearchResult = components["schemas"]["ProductSearchResult"];

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export const ProductSearchPage = () => {
  const [cityId, setCityId] = useState("");
  const [query, setQuery] = useState("");

  const citiesQuery = useCities();
  const search = useProductSearch();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!cityId) return;
    search.mutate({
      cityId,
      query: query || undefined,
    });
  };

  const items = search.data?.items ?? [];

  const cityOptions = useMemo(() => {
    const data = citiesQuery.data as unknown;
    if (Array.isArray(data)) return data as City[];
    if (data && typeof data === "object" && Array.isArray((data as { items?: City[] }).items)) {
      return (data as { items: City[] }).items ?? [];
    }
    return [] as City[];
  }, [citiesQuery.data]);

  const cityMap = useMemo(() => {
    return new Map(cityOptions.map((city) => [city.id, city]));
  }, [cityOptions]);


  const resolveCityName = (offer: ProductSearchResult) => {
    const city = cityMap.get(offer.city?.id ?? "");
    return city ? `${city.name} - ${city.state}` : offer.city?.name ?? "";
  };

  const resolveCompanyLabel = (offer: ProductSearchResult) => {
    return offer.company?.name ?? "Empresa local";
  };

  const resolveValidUntil = (offer: ProductSearchResult) => {
    if (!offer.validUntil) return null;
    const date = new Date(offer.validUntil);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString("pt-BR");
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Buscar produtos</h1>
            <p className="text-sm text-slate-600">
              Consulte ofertas por cidade e produto. Dados seedados para Itapetininga.
            </p>
          </div>
          <span className="text-xs text-slate-500">Beta público</span>
        </div>
        <form className="mt-6 grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700" htmlFor="city">
              Cidade
            </label>
            <select
              id="city"
              value={cityId}
              onChange={(event) => setCityId(event.target.value)}
              className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm"
              required
            >
              <option value="">Selecione</option>
              {cityOptions.map((city) => (
                <option key={city.id} value={city.id}>
                  {city.name} - {city.state}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700" htmlFor="query">
              O que procura?
            </label>
            <Input
              id="query"
              placeholder="Ex: pão francês, cadeira, forno..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="md:col-span-2">
            <Button type="submit" disabled={search.isPending || !cityId} className="w-full md:w-auto">
              {search.isPending ? "Buscando..." : "Listar ofertas"}
            </Button>
          </div>
        </form>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Ofertas encontradas</h2>
        {search.isPending ? <p className="text-sm text-slate-500">Buscando produtos...</p> : null}
        {search.error ? (
          <p className="text-sm text-rose-600">Não foi possível carregar as ofertas. Tente novamente.</p>
        ) : null}
        {!items.length && !search.isPending && !search.error ? (
          <p className="text-sm text-slate-500">
            Nenhuma oferta listada ainda. Busque por cidade e produto para ver os resultados divulgados.
          </p>
        ) : null}
        <div className="space-y-3">
          {items.map((offer) => (
            <div
              key={offer.id}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-lg font-semibold text-slate-900">{offer.title}</p>
                  <p className="text-xs uppercase tracking-wide text-slate-500">
                    {resolveCompanyLabel(offer)}
                  </p>
                  {offer.company?.address ? (
                    <p className="mt-1 text-sm text-slate-600">{offer.company.address}</p>
                  ) : null}
                </div>
                <p className="text-xl font-semibold text-brand-600">
                  {currency.format((offer.priceCents ?? 0) / 100)}
                </p>
              </div>
              <p className="mt-3 text-xs text-slate-500">Disponível em {resolveCityName(offer)}</p>
              {resolveValidUntil(offer) ? (
                <p className="mt-1 text-xs text-slate-500">Valido ate {resolveValidUntil(offer)}</p>
              ) : null}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
