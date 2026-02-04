import { useMemo, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useCities, useNiches } from "@/features/catalog/useCatalog";
import { useCompanySearch } from "@/features/public/hooks/useCompanySearch";
import { trackOfferedByEvent } from "@/lib/api/searchTracking";
import type { components } from "@/lib/api/types";

type CompanySearchResult = NonNullable<components["schemas"]["SearchResponse"]["results"]>[number];
type City = components["schemas"]["City"];
type Niche = components["schemas"]["Niche"];

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
});

export const CompanySearchPage = () => {
  const [cityId, setCityId] = useState("");
  const [nicheId, setNicheId] = useState("");
  const [query, setQuery] = useState("");

  const citiesQuery = useCities();
  const nichesQuery = useNiches();
  const search = useCompanySearch();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!cityId || !nicheId) return;

    search.mutate({
      cityId,
      nicheId,
      query: query || undefined,
    });
  };

  const results = search.data?.results ?? [];
  const paidResults = results.filter((result) => result.isPaid);
  const organicResults = results.filter((result) => !result.isPaid);
  const offeredBy = search.data?.offeredBy;

  const handleOfferedByClick = (
    type: "click_whatsapp" | "click_call" | "click_site" | "click_promotions"
  ) => {
    if (!offeredBy?.configId || !search.data?.searchId) return;
    trackOfferedByEvent(offeredBy.configId, {
      type,
      searchId: search.data.searchId,
    }).catch(() => {});
  };

  const normalizeDigits = (value?: string | null) => {
    const digits = value?.replace(/\D/g, "") ?? "";
    return digits ? digits : null;
  };
  const offeredByWhatsAppDigits = normalizeDigits(offeredBy?.whatsappE164);
  const offeredByPhoneDigits = normalizeDigits(offeredBy?.phoneE164);
  const offeredByWhatsAppLink = offeredByWhatsAppDigits
    ? `https://wa.me/${offeredByWhatsAppDigits}`
    : null;
  const offeredByPhoneLink = offeredByPhoneDigits
    ? `tel:${offeredByPhoneDigits}`
    : null;

  const cityOptions = useMemo(() => {
    const data = citiesQuery.data as unknown;
    if (Array.isArray(data)) return data as City[];
    if (data && typeof data === "object" && Array.isArray((data as { items?: City[] }).items)) {
      return (data as { items: City[] }).items ?? [];
    }
    return [] as City[];
  }, [citiesQuery.data]);

  const nicheOptions = useMemo(() => {
    const data = nichesQuery.data as unknown;
    if (Array.isArray(data)) return data as Niche[];
    if (data && typeof data === "object" && Array.isArray((data as { items?: Niche[] }).items)) {
      return (data as { items: Niche[] }).items ?? [];
    }
    return [] as Niche[];
  }, [nichesQuery.data]);

  const renderResultCard = (result: CompanySearchResult) => {
    const company = result.company;
    const maybeCharged = (result as Record<string, unknown>)["chargedAmount"] ?? undefined;
    const chargedAmount = typeof maybeCharged === "number" ? maybeCharged : undefined;
    const nicheLabel = company?.niches?.[0]?.label;

    return (
      <div
        key={result.clickTrackingId ?? `${result.position}-${company?.id}`}
        className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
            <span className="text-xl text-slate-900">#{result.rank}</span>
            <span>Posição {result.position}</span>
          </div>
          {result.isPaid ? (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
              Patrocinado
            </span>
          ) : null}
        </div>
        <div className="mt-3 space-y-1">
          <p className="text-lg font-semibold text-slate-900">
            {company?.tradeName ?? "Empresa encontrada"}
          </p>
          {nicheLabel ? <p className="text-xs text-slate-500">{nicheLabel}</p> : null}
          {company?.city?.name ? (
            <p className="text-sm text-slate-500">
              {company.city.name}
              {company.city.state ? ` - ${company.city.state}` : null}
            </p>
          ) : (
            <p className="text-sm text-slate-500">Cidade não informada</p>
          )}
          {company?.channels?.phone ? (
            <p className="text-xs text-slate-500">
              Tel: {company.channels.phone}
              {company.channels.whatsapp ? " | WhatsApp disponível" : ""}
            </p>
          ) : null}
        </div>
        {result.isPaid ? (
          <p className="mt-3 text-xs text-slate-500">
            Cobrança por clique:{" "}
            {chargedAmount ? currency.format(chargedAmount) : "valor definido no leilão"}
          </p>
        ) : null}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Buscar empresas</h1>
            <p className="text-sm text-slate-600">
              Use Itapetininga e um nicho para testar os dados seedados.
            </p>
          </div>
          <span className="text-xs text-slate-500">Dados reais do Postgres local</span>
        </div>
        <form className="mt-6 grid gap-4 md:grid-cols-3" onSubmit={handleSubmit}>
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
            <label className="text-sm font-medium text-slate-700" htmlFor="niche">
              Nicho
            </label>
            <select
              id="niche"
              value={nicheId}
              onChange={(event) => setNicheId(event.target.value)}
              className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm"
              required
            >
              <option value="">Selecione</option>
              {nicheOptions.map((niche) => (
                <option key={niche.id} value={niche.id}>
                  {niche.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700" htmlFor="query">
              O que precisa?
            </label>
            <Input
              id="query"
              placeholder="Ex: arquiteto, dentista..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="md:col-span-3">
            <Button type="submit" disabled={search.isPending || !cityId || !nicheId} className="w-full md:w-auto">
              {search.isPending ? "Buscando..." : "Ver ranking"}
            </Button>
          </div>
        </form>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Resultado do ranking</h2>
        {search.isPending ? <p className="text-sm text-slate-500">Buscando empresas...</p> : null}
        {search.error ? (
          <p className="text-sm text-rose-600">Não foi possível carregar o ranking. Tente novamente.</p>
        ) : null}
        {!results.length && !search.isPending && !search.error ? (
          <p className="text-sm text-slate-500">
            Preencha o formulário e veja até cinco empresas relevantes para a sua busca.
          </p>
        ) : null}
        <div className="space-y-3">
          {paidResults.length ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                Destaques pagos
              </p>
              <div className="space-y-3">{paidResults.map((result) => renderResultCard(result))}</div>
            </div>
          ) : null}
          {organicResults.length ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Resultados orgânicos
              </p>
              <div className="space-y-3">
                {organicResults.map((result) => renderResultCard(result))}
              </div>
            </div>
          ) : null}
          {offeredBy ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  Oferecido por: <strong>{offeredBy.text}</strong>
                </span>
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  {offeredByWhatsAppLink ? (
                    <a
                      href={offeredByWhatsAppLink}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-amber-900 underline"
                      onClick={() => handleOfferedByClick("click_whatsapp")}
                    >
                      WhatsApp
                    </a>
                  ) : null}
                  {offeredByPhoneLink ? (
                    <a
                      href={offeredByPhoneLink}
                      className="font-semibold text-amber-900 underline"
                      onClick={() => handleOfferedByClick("click_call")}
                    >
                      Telefone
                    </a>
                  ) : null}
                  {offeredBy.website ? (
                    <a
                      href={offeredBy.website}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-amber-900 underline"
                      onClick={() => handleOfferedByClick("click_site")}
                    >
                      Site
                    </a>
                  ) : null}
                  {offeredBy.promotionsUrl ? (
                    <a
                      href={offeredBy.promotionsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-amber-900 underline"
                      onClick={() => handleOfferedByClick("click_promotions")}
                    >
                      Promocoes
                    </a>
                  ) : null}
                </div>
              </div>
              {offeredBy.imageUrl ? (
                <img
                  src={offeredBy.imageUrl}
                  alt={offeredBy.text}
                  className="mt-3 w-full max-w-sm rounded-md border border-amber-200"
                />
              ) : null}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
};
