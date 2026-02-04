import { useEffect, useRef, useState } from "react";

import { usePublicSearch } from "@/features/public-search/usePublicSearch";
import { trackOfferedByEvent, trackSearchEvent } from "@/lib/api/searchTracking";

const Tag = ({ children, tone }: { children: string; tone: "auction" | "organic" | "offer" }) => {
  const styles =
    tone === "auction"
      ? "bg-indigo-50 text-indigo-700"
      : tone === "offer"
        ? "bg-amber-50 text-amber-700"
        : "bg-emerald-50 text-emerald-700";
  return (
    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${styles}`}>{children}</span>
  );
};

export const PublicSearchPage = () => {
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("");
  const [niche, setNiche] = useState("");
  const { results, offeredBy, searchId, loading, error, search } = usePublicSearch();
  const trackedSearchIds = useRef(new Set<string>());

  const handleSearch = () => {
    if (!query.trim() || !city.trim()) return;
    search({ text: query.trim(), city: city.trim(), niche: niche.trim() || undefined });
  };

  useEffect(() => {
    if (!searchId || trackedSearchIds.current.has(searchId)) return;
    trackedSearchIds.current.add(searchId);
    trackSearchEvent(searchId, { type: "impression" }).catch(() => {});
  }, [searchId]);

  const handleOfferedByClick = (
    type: "click_whatsapp" | "click_call" | "click_site" | "click_promotions"
  ) => {
    if (!offeredBy?.configId || !searchId) return;
    trackOfferedByEvent(offeredBy.configId, { type, searchId }).catch(() => {});
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

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-4xl px-4 py-10">
        <header className="mb-6">
          <h1 className="text-3xl font-semibold text-slate-900">Buscar no BUSCAÍ</h1>
          <p className="text-sm text-slate-600">
            Teste rapidamente o ranking retornado pelo backend de busca.
          </p>
        </header>

        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <label className="text-sm font-medium text-slate-800" htmlFor="city">
            Cidade
          </label>
          <input
            id="city"
            type="text"
            className="mt-2 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            placeholder="Ex: Itapetininga"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
          <label className="mt-4 text-sm font-medium text-slate-800" htmlFor="query">
            O que voc?? procura?
          </label>
          <div className="mt-2 flex gap-2">
            <input
              id="query"
              type="text"
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              placeholder="Ex: Plumber em Itapetininga"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSearch();
                }
              }}
            />
            <button
              type="button"
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
              onClick={handleSearch}
              disabled={loading || !city.trim()}
            >
              {loading ? "Buscando..." : "Buscar"}
            </button>
          </div>
          <label className="mt-4 text-sm font-medium text-slate-800" htmlFor="niche">
            Nicho (opcional)
          </label>
          <input
            id="niche"
            type="text"
            className="mt-2 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            placeholder="Ex: dentista"
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
          />
          {error ? (
            <p className="mt-2 text-sm text-rose-700">{error}</p>
          ) : null}
        </div>

        <section className="mt-6">
          <h2 className="text-lg font-semibold text-slate-900">Resultados</h2>
          <div className="mt-3 space-y-3">
            {results.length === 0 && !loading ? (
              <p className="text-sm text-slate-600">
                {query.trim() ? "Nenhum resultado encontrado." : "Nenhum resultado ainda."}
              </p>
            ) : null}
            {results.map((item) => (
              <div
                key={`${item.companyId}-${item.posicao}`}
                className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {item.empresa || "Empresa"}
                    </p>
                    <p className="text-xs text-slate-600">{item.produto || "Produto"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-800">
                      Posição {item.posicao || 0}
                    </span>
                    {item.tipo === "oferecido" ? (
                      <Tag tone="offer">Oferecido por</Tag>
                    ) : item.tipo === "leilao" ? (
                      <Tag tone="auction">Leilão (1,2,3)</Tag>
                    ) : (
                      <Tag tone="organic">Orgânico (4,5)</Tag>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {offeredBy ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
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
    </div>
  );
};
