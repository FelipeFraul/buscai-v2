import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { fetchDashboardAnalytics } from "@/features/dashboard/api";
import type { DashboardAnalytics } from "@/features/dashboard/types";
import { apiClient } from "@/lib/api/client";
import {
  adaptDashboardToLegacyShape,
  type LegacyDashboardResponse,
} from "@/lib/analyticsAdapter";
import { cn, formatCurrencyFromCents } from "@/lib/utils";

import { useMeCompany } from "./useMeCompany";
import { useCompanies } from "@/features/companies/useCompanies";

const statusLabels: Record<string, string> = {
  active: "Ativa",
  pending: "Pendente",
  suspended: "Suspensa",
};

const formatPhone = (phone?: string | null) => phone?.trim() || "-";
const getStatusLabel = (status?: string | null) =>
  status ? statusLabels[status] ?? status : undefined;
const formatCurrency = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type CompetitiveSummary = {
  companyId: string;
  auction: {
    active: boolean;
    activeConfigs: number;
    activeDailyBudget: number;
    totalDailyBudget: number;
    highestBid: number;
  };
  products: {
    totalOffers: number;
    activeOffers: number;
    items: Array<{
      title: string;
      priceCents: number;
      isActive: boolean;
    }>;
  };
};

export const MyCompanyPage = () => {
  const companiesQuery = useCompanies();
  const ownedCompanies = companiesQuery.data?.items ?? [];
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const {
    data: companyData,
    isLoading: companyLoading,
    error: companyError,
  } = useMeCompany(selectedCompanyId ?? undefined);
  const [companyLookup, setCompanyLookup] = useState("");
  const [selectedCompetitorId, setSelectedCompetitorId] = useState<string | null>(null);
  const [recentCompetitors, setRecentCompetitors] = useState<
    Array<{ id: string; tradeName: string; cityLabel: string }>
  >([]);

  const {
    data: dashboardRaw,
    isLoading: dashboardLoading,
    error: dashboardError,
  } = useQuery<DashboardAnalytics>({
    queryKey: ["analytics-dashboard", "raw", companyData?.company?.id ?? "none"],
    enabled: Boolean(companyData?.company?.id),
    queryFn: async () => fetchDashboardAnalytics(companyData?.company?.id),
  });
  const dashboardData: LegacyDashboardResponse | null = useMemo(
    () => (dashboardRaw ? adaptDashboardToLegacyShape(dashboardRaw) : null),
    [dashboardRaw]
  );

  const totals = dashboardData?.totals ?? {
    impressions: 0,
    contacts: 0,
    totalCostCents: 0,
    costPerContactCents: 0,
  };
  const bestHours = useMemo(
    () =>
      [...(dashboardData?.byHour ?? [])]
        .sort((a, b) => (b.contacts ?? 0) - (a.contacts ?? 0))
        .slice(0, 3),
    [dashboardData?.byHour]
  );
  const bestNiches = useMemo(
    () =>
      [...(dashboardData?.byNiche ?? [])]
        .sort((a, b) => (b.contacts ?? 0) - (a.contacts ?? 0))
        .slice(0, 3),
    [dashboardData?.byNiche]
  );

  const wallet = companyData?.billing?.wallet;
  const company = companyData?.company;
  const statusLabel = getStatusLabel(company?.status);
  const appearances = dashboardRaw?.appearances;
  const actions = dashboardRaw?.actions;
  const origins = dashboardRaw?.origins;

  const loading = companyLoading || dashboardLoading;

  useEffect(() => {
    if (!ownedCompanies.length) {
      setSelectedCompanyId(null);
      return;
    }
    if (!selectedCompanyId) {
      setSelectedCompanyId(ownedCompanies[0].id);
      return;
    }
    const exists = ownedCompanies.some((item) => item.id === selectedCompanyId);
    if (!exists) {
      setSelectedCompanyId(ownedCompanies[0].id);
    }
  }, [ownedCompanies, selectedCompanyId]);

  const companyLookupQuery = useQuery<{ items: Array<{
    id: string;
    tradeName: string;
    status?: string;
    city?: { id: string; name: string; state: string };
  }> }>({
    queryKey: ["companies", "search", companyLookup, company?.city?.id ?? "none"],
    enabled: companyLookup.trim().length >= 3,
    queryFn: async () => {
      const response = await apiClient.get("/companies/search", {
        params: {
          q: companyLookup.trim(),
          cityId: company?.city?.id,
          limit: 5,
        },
      });
      return response.data;
    },
  });
  const companyLookupResults = companyLookupQuery.data?.items ?? [];
  const normalizedLookup = companyLookup.trim().toLowerCase();
  const shouldShowResults =
    normalizedLookup.length >= 3 &&
    companyLookupResults.length > 0 &&
    !companyLookupResults.some(
      (item) => item.tradeName.toLowerCase() === normalizedLookup
    );
  const competitorQuery = useQuery<CompetitiveSummary>({
    queryKey: ["companies", "competitive-summary", selectedCompetitorId ?? "none"],
    enabled: Boolean(selectedCompetitorId),
    queryFn: async () => {
      const response = await apiClient.get(
        `/companies/${selectedCompetitorId}/competitive-summary`
      );
      return response.data as CompetitiveSummary;
    },
  });

  useEffect(() => {
    if (!companyLookupResults.length) {
      setSelectedCompetitorId(null);
      return;
    }
    if (!selectedCompetitorId) {
      setSelectedCompetitorId(companyLookupResults[0].id);
      return;
    }
    const exists = companyLookupResults.some(
      (item) => item.id === selectedCompetitorId
    );
    if (!exists) {
      setSelectedCompetitorId(companyLookupResults[0].id);
    }
  }, [companyLookupResults, selectedCompetitorId]);

  useEffect(() => {
    const stored = localStorage.getItem("recent_competitors");
    if (!stored) {
      return;
    }
    try {
      const parsed = JSON.parse(stored) as Array<{
        id: string;
        tradeName: string;
        cityLabel: string;
      }>;
      setRecentCompetitors(parsed.slice(0, 3));
    } catch {
      setRecentCompetitors([]);
    }
  }, []);

  const pushRecentCompetitor = (item: { id: string; tradeName: string; cityLabel: string }) => {
    setRecentCompetitors((prev) => {
      const next = [item, ...prev.filter((entry) => entry.id !== item.id)].slice(0, 3);
      localStorage.setItem("recent_competitors", JSON.stringify(next));
      return next;
    });
  };

  return (
    <div className="space-y-6 pb-8">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Minha Empresa</p>
          <Button asChild size="sm" variant="outline">
            <Link to="/companies/new">Adicionar Nova Empresa</Link>
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold text-slate-900">{company?.tradeName ?? "Empresa"}</h1>
          {statusLabel ? (
            <span
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold",
                company?.status === "active"
                  ? "bg-emerald-50 text-emerald-800"
                  : "bg-amber-50 text-amber-800"
              )}
            >
              {statusLabel}
            </span>
          ) : null}
          {company?.city ? (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              {company.city.name} / {company.city.state}
            </span>
          ) : null}
        </div>
        {ownedCompanies.length > 1 ? (
          <div className="flex flex-wrap gap-2">
            {ownedCompanies.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedCompanyId(item.id)}
                className={[
                  "rounded-full border px-3 py-1 text-xs font-semibold",
                  item.id === selectedCompanyId
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300",
                ].join(" ")}
              >
                {item.tradeName}
              </button>
            ))}
          </div>
        ) : null}
        {company?.legalName ? (
          <p className="text-sm text-slate-600">Razao social: {company.legalName}</p>
        ) : null}
      </header>

      {companyError ? (
        <Card className="border-rose-200 bg-rose-50 text-rose-800">
          Nao foi possivel carregar os dados da empresa. Tente novamente mais tarde.
        </Card>
      ) : null}
      {dashboardError ? (
        <Card className="border-rose-200 bg-rose-50 text-rose-800">
          Nao foi possivel carregar os dados de desempenho. Tente novamente mais tarde.
        </Card>
      ) : null}

      {loading ? (
        <Card>Carregando...</Card>
      ) : (
        <>
          <section className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <Card className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-slate-900">Dados da empresa</h2>
                {company?.id ? (
                  <Button variant="ghost" size="sm" asChild>
                    <Link to={`/companies/${company.id}`}>Configurar dados da empresa</Link>
                  </Button>
                ) : null}
              </div>
              <div className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Cidade</p>
                  <p className="font-semibold text-slate-900">
                    {company?.city ? `${company.city.name} / ${company.city.state}` : "-"}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Endereco</p>
                  <p className="font-semibold text-slate-900">
                    {company?.channels?.address?.trim() || "-"}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Nichos</p>
                  <div className="flex flex-wrap gap-2">
                    {(company?.niches ?? []).length === 0 ? (
                      <span className="text-slate-600">-</span>
                    ) : (
                      company?.niches?.map((niche) => (
                        <span
                          key={niche.id}
                          className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-800"
                        >
                          {niche.label}
                        </span>
                      ))
                    )}
                  </div>
                </div>
                <div className="grid gap-1">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Telefone</p>
                    <p className="font-semibold text-slate-900">{formatPhone(company?.channels?.phone)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">WhatsApp</p>
                    <p className="font-semibold text-slate-900">{formatPhone(company?.channels?.whatsapp)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Horario</p>
                    <p className="font-semibold text-slate-900">
                      {company?.channels?.openingHours?.trim() || "-"}
                    </p>
                  </div>
                </div>
              </div>
            </Card>

            <Card className="space-y-3">
              <h2 className="text-lg font-semibold text-slate-900">Resumo operacional</h2>
              <div className="space-y-3">
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Wallet</p>
                  <p className="text-2xl font-bold text-slate-900">
                    {formatCurrencyFromCents(wallet?.balanceCents)}
                  </p>
                  <p className="text-sm text-slate-600">
                    Reservado: {formatCurrencyFromCents(wallet?.reservedCents)}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Produtos ativos</p>
                    <p className="text-xl font-bold text-slate-900">
                      {companyData?.products?.activeOffers ?? 0}
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Configs de leilao</p>
                    <p className="text-xl font-bold text-slate-900">
                      {companyData?.auction?.activeConfigs ?? 0}
                    </p>
                  </div>
                </div>
              </div>
            </Card>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-900">Buscar concorrentes</h2>
            <Card className="space-y-3">
              <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
                <div className="space-y-3">
                  <div className="max-w-xl">
                    <label className="text-sm font-medium text-slate-700" htmlFor="company-search">
                      Empresa
                    </label>
                    <Input
                      id="company-search"
                      placeholder="Digite 3 letras para buscar empresa"
                      value={companyLookup}
                      onChange={(event) => setCompanyLookup(event.target.value)}
                      className="mt-1"
                    />
                  </div>
                  {recentCompetitors.length ? (
                    <div className="flex flex-wrap gap-2">
                      {recentCompetitors.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCompetitorId(item.id);
                              setCompanyLookup(item.tradeName);
                            }}
                            className="text-slate-700 hover:text-slate-900"
                          >
                            {item.tradeName}
                          </button>
                          <button
                            type="button"
                            aria-label={`Remover ${item.tradeName}`}
                            className="rounded-full px-1 text-slate-400 hover:text-slate-700"
                            onClick={() => {
                              const next = recentCompetitors.filter((entry) => entry.id !== item.id);
                              setRecentCompetitors(next);
                              localStorage.setItem("recent_competitors", JSON.stringify(next));
                            }}
                          >
                            x
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {companyLookup.trim().length >= 3 ? (
                    companyLookupQuery.isLoading ? (
                      <p className="text-sm text-slate-500">Carregando...</p>
                    ) : shouldShowResults ? (
                      <div className="max-w-xl rounded-md border border-slate-200 bg-white">
                        {companyLookupResults.slice(0, 5).map((companyItem, index) => (
                          <button
                            key={companyItem.id}
                            type="button"
                            onClick={() => {
                              setSelectedCompetitorId(companyItem.id);
                              setCompanyLookup(companyItem.tradeName);
                              pushRecentCompetitor({
                                id: companyItem.id,
                                tradeName: companyItem.tradeName,
                                cityLabel: companyItem.city
                                  ? `${companyItem.city.name} - ${companyItem.city.state}`
                                  : "-",
                              });
                            }}
                            className={[
                              "block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50",
                              index > 0 ? "border-t border-slate-100" : "",
                            ].join(" ")}
                          >
                            <p className="font-medium text-slate-900">{companyItem.tradeName}</p>
                            <p className="text-xs text-slate-500">
                              {companyItem.city?.name ?? "-"}
                              {companyItem.city?.state ? ` - ${companyItem.city.state}` : ""}
                            </p>
                          </button>
                        ))}
                      </div>
                    ) : null
                  ) : null}
                  {companyLookupQuery.isError ? (
                    <p className="text-sm text-rose-600">
                      Nao foi possivel carregar a lista de empresas. Tente novamente.
                    </p>
                  ) : null}
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-sm font-semibold text-slate-900">Detalhes do concorrente</p>
                  {competitorQuery.isLoading ? (
                    <p className="mt-2 text-xs text-slate-500">Carregando...</p>
                  ) : competitorQuery.isError ? (
                    <p className="mt-2 text-xs text-rose-600">
                      Nao foi possivel carregar os detalhes.
                    </p>
                  ) : competitorQuery.data ? (
                    <div className="mt-3 space-y-3 text-xs text-slate-600">
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-slate-500">Leilao</p>
                        <p>
                          Participa ativo:{" "}
                          <strong className="text-slate-900">
                            {competitorQuery.data.auction.active ? "Sim" : "Nao"}
                          </strong>
                        </p>
                        <p>
                          Configs ativas:{" "}
                          <strong className="text-slate-900">
                            {competitorQuery.data.auction.activeConfigs}
                          </strong>
                        </p>
                        <p>
                          Empenho ativo (dia):{" "}
                          <strong className="text-slate-900">
                            {formatCurrency(competitorQuery.data.auction.activeDailyBudget)}
                          </strong>
                        </p>
                        <p>
                          Empenho total (dia):{" "}
                          <strong className="text-slate-900">
                            {formatCurrency(competitorQuery.data.auction.totalDailyBudget)}
                          </strong>
                        </p>
                        <p>
                          Maior lance:{" "}
                          <strong className="text-slate-900">
                            {formatCurrencyFromCents(competitorQuery.data.auction.highestBid)}
                          </strong>
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-slate-500">Produtos</p>
                        <p>
                          Produtos ativos:{" "}
                          <strong className="text-slate-900">
                            {competitorQuery.data.products.activeOffers}
                          </strong>
                        </p>
                        <p>
                          Total de produtos:{" "}
                          <strong className="text-slate-900">
                            {competitorQuery.data.products.totalOffers}
                          </strong>
                        </p>
                        {competitorQuery.data.products.items.length ? (
                          <ul className="mt-2 space-y-1">
                            {competitorQuery.data.products.items.map((item) => (
                              <li key={`${item.title}-${item.priceCents}`}>
                                {item.title} — {formatCurrencyFromCents(item.priceCents)}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-1">Nenhum produto anunciado.</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-slate-500">
                      Selecione um concorrente para ver os detalhes.
                    </p>
                  )}
                </div>
              </div>
            </Card>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-900">Desempenho total</h2>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <Card className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-slate-500">Impressoes</p>
                <p className="text-2xl font-bold text-slate-900">
                  {(totals.impressions ?? 0).toLocaleString("pt-BR")}
                </p>
              </Card>
              <Card className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-slate-500">Contatos</p>
                <p className="text-2xl font-bold text-slate-900">
                  {(totals.contacts ?? 0).toLocaleString("pt-BR")}
                </p>
              </Card>
              <Card className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-slate-500">Custo total</p>
                <p className="text-2xl font-bold text-slate-900">
                  {formatCurrencyFromCents(totals.totalCostCents)}
                </p>
              </Card>
              <Card className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-slate-500">Custo por contato</p>
                <p className="text-2xl font-bold text-slate-900">
                  {formatCurrencyFromCents(totals.costPerContactCents)}
                </p>
              </Card>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <Card className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900">Melhores horarios</p>
                  <span className="text-xs text-slate-500">Top 3</span>
                </div>
                {bestHours.length === 0 ? (
                  <p className="text-sm text-slate-600">Sem dados no periodo.</p>
                ) : (
                  <ul className="space-y-2">
                    {bestHours.map((item) => (
                      <li
                        key={item.hour}
                        className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"
                      >
                        <span className="text-sm font-semibold text-slate-900">{item.hour}h</span>
                        <span className="text-sm text-slate-700">
                          {item.contacts ?? 0} contatos / {item.impressions ?? 0} impr.
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900">Melhores nichos</p>
                  <span className="text-xs text-slate-500">Top 3</span>
                </div>
                {bestNiches.length === 0 ? (
                  <p className="text-sm text-slate-600">Sem dados no periodo.</p>
                ) : (
                  <ul className="space-y-2">
                    {bestNiches.map((item) => (
                      <li
                        key={item.nicheId}
                        className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"
                      >
                        <span className="text-sm font-semibold text-slate-900">
                          {item.label ?? item.nicheId}
                        </span>
                        <span className="text-sm text-slate-700">
                          {item.contacts ?? 0} contatos / {item.impressions ?? 0} impr.
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-900">Aparicoes</h2>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <Card className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-slate-500">Total</p>
                <p className="text-2xl font-bold text-slate-900">
                  {(appearances?.total ?? 0).toLocaleString("pt-BR")}
                </p>
              </Card>
              <Card className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-slate-500">Leilao (1-3)</p>
                <p className="text-2xl font-bold text-slate-900">
                  {(
                    (appearances?.auction?.pos1 ?? 0) +
                    (appearances?.auction?.pos2 ?? 0) +
                    (appearances?.auction?.pos3 ?? 0)
                  ).toLocaleString("pt-BR")}
                </p>
              </Card>
              <Card className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-slate-500">Organicos (4-5)</p>
                <p className="text-2xl font-bold text-slate-900">
                  {(
                    (appearances?.organic?.pos4 ?? 0) +
                    (appearances?.organic?.pos5 ?? 0)
                  ).toLocaleString("pt-BR")}
                </p>
              </Card>
              <Card className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-slate-500">Oferecido por</p>
                <p className="text-2xl font-bold text-slate-900">
                  {(appearances?.offered ?? 0).toLocaleString("pt-BR")}
                </p>
              </Card>
            </div>
            <Card className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">Produto buscado</p>
                <span className="text-xs text-slate-500">Top 5</span>
              </div>
              {appearances?.byProduct?.length ? (
                <ul className="space-y-2">
                  {appearances.byProduct.slice(0, 5).map((item) => (
                    <li
                      key={item.product}
                      className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"
                    >
                      <span className="text-sm font-semibold text-slate-900">
                        {item.product || "N/A"}
                      </span>
                      <span className="text-sm text-slate-700">{item.total}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-600">Sem dados no periodo.</p>
              )}
            </Card>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-900">Clique e contato</h2>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <Card className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-slate-500">Cliques/contatos</p>
                <p className="text-2xl font-bold text-slate-900">
                  {(actions?.totalClicks ?? 0).toLocaleString("pt-BR")}
                </p>
              </Card>
              <Card className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-slate-500">Cliques em ligar</p>
                <p className="text-2xl font-bold text-slate-900">
                  {(actions?.calls ?? 0).toLocaleString("pt-BR")}
                </p>
              </Card>
              <Card className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-slate-500">Cliques no WhatsApp</p>
                <p className="text-2xl font-bold text-slate-900">
                  {(actions?.whatsapp ?? 0).toLocaleString("pt-BR")}
                </p>
              </Card>
              <Card className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-slate-500">Taxa de acao (CTR)</p>
                <p className="text-2xl font-bold text-slate-900">
                  {((actions?.ctr ?? 0) * 100).toFixed(1)}%
                </p>
              </Card>
            </div>
            <Card className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">Origem dos contatos</p>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Ligacoes</p>
                  <p className="text-lg font-semibold text-slate-900">{origins?.calls ?? 0}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">WhatsApp</p>
                  <p className="text-lg font-semibold text-slate-900">{origins?.whatsapp ?? 0}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Web</p>
                  <p className="text-lg font-semibold text-slate-900">{origins?.web ?? 0}</p>
                </div>
              </div>
            </Card>
          </section>
        </>
      )}
    </div>
  );
};








