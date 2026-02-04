import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Card } from "@/components/ui/Card";
import { AuctionForm } from "@/features/auction/AuctionForm";
import { AuctionList } from "@/features/auction/AuctionList";
import { CompanySelector } from "@/features/companies/CompanySelector";
import { useCompanySelection } from "@/features/companies/useCompanySelection";
import { fetchDashboardAnalytics } from "@/features/dashboard/api";
import type { DashboardAnalytics } from "@/features/dashboard/types";
import {
  adaptDashboardToLegacyShape,
  type LegacyDashboardResponse,
} from "@/lib/analyticsAdapter";
import { formatCurrencyFromCents } from "@/lib/utils";
import type { components } from "@/lib/api/types";

type AuctionConfig = components["schemas"]["AuctionConfig"];

export const AuctionPage = () => {
  const {
    companies,
    isLoading,
    selectedCompanyId,
    setSelectedCompanyId,
  } = useCompanySelection();
  const [formMode, setFormMode] = useState<"none" | "create" | "edit">("none");
  const [editingConfig, setEditingConfig] = useState<AuctionConfig | undefined>();
  const [metricsConfig, setMetricsConfig] = useState<AuctionConfig | undefined>();
  const [isMetricsOpen, setIsMetricsOpen] = useState(false);
  const [selectedNicheId, setSelectedNicheId] = useState<string | undefined>();

  const selectedCompany = useMemo(
    () => companies.find((company) => company.id === selectedCompanyId),
    [companies, selectedCompanyId]
  );
  const companyNiches = selectedCompany?.niches ?? [];

  useEffect(() => {
    if (!selectedCompanyId) {
      setSelectedNicheId(undefined);
      return;
    }
    if (selectedNicheId && companyNiches.some((niche) => niche.id === selectedNicheId)) {
      return;
    }
    setSelectedNicheId(companyNiches[0]?.id);
  }, [companyNiches, selectedCompanyId, selectedNicheId]);

  const auctionAnalyticsQuery = useQuery<DashboardAnalytics>({
    queryKey: [
      "analytics-dashboard",
      "auction",
      selectedCompanyId ?? "none",
      metricsConfig?.nicheId ?? "none",
      metricsConfig?.cityId ?? "none",
    ],
    enabled: Boolean(selectedCompanyId && metricsConfig?.nicheId),
    queryFn: async () =>
      fetchDashboardAnalytics({
        companyId: selectedCompanyId,
        nicheId: metricsConfig?.nicheId,
        cityId: metricsConfig?.cityId,
      }),
  });
  const auctionDashboard: LegacyDashboardResponse | null = useMemo(
    () =>
      auctionAnalyticsQuery.data
        ? adaptDashboardToLegacyShape(auctionAnalyticsQuery.data)
        : null,
    [auctionAnalyticsQuery.data]
  );
  const auctionTotals = auctionDashboard?.totals ?? {
    impressions: 0,
    contacts: 0,
    totalCostCents: 0,
    costPerContactCents: 0,
  };
  const auctionBestHours = useMemo(
    () =>
      [...(auctionDashboard?.byHour ?? [])]
        .sort((a, b) => (b.contacts ?? 0) - (a.contacts ?? 0))
        .slice(0, 3),
    [auctionDashboard?.byHour]
  );
  const auctionBestNiches = useMemo(
    () =>
      [...(auctionDashboard?.byNiche ?? [])]
        .sort((a, b) => (b.contacts ?? 0) - (a.contacts ?? 0))
        .slice(0, 3),
    [auctionDashboard?.byNiche]
  );
  const auctionAppearances = auctionAnalyticsQuery.data?.appearances;
  const auctionActions = auctionAnalyticsQuery.data?.actions;
  const auctionOrigins = auctionAnalyticsQuery.data?.origins;
  const metricsNicheLabel = useMemo(() => {
    if (!metricsConfig?.nicheId) return null;
    const match = companyNiches.find((niche) => niche.id === metricsConfig.nicheId);
    return match?.label ?? metricsConfig.nicheId;
  }, [companyNiches, metricsConfig?.nicheId]);

  const handleCloseForm = () => {
    setEditingConfig(undefined);
    setFormMode("none");
  };

  const handleCloseMetrics = () => {
    setIsMetricsOpen(false);
    setMetricsConfig(undefined);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <CompanySelector
          companies={companies}
          isLoading={isLoading}
          value={selectedCompanyId}
          onChange={setSelectedCompanyId}
          label="Empresa para o leilao"
        />
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold text-slate-900">
            Escolha o nicho para criar seu lance
          </p>
          <p className="text-xs text-slate-500">
            Selecione um nicho cadastrado para esta empresa.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {!selectedCompanyId ? (
              <span className="text-xs font-medium text-slate-500">
                Selecione uma empresa para ver os nichos.
              </span>
            ) : companyNiches.length === 0 ? (
              <span className="text-xs font-medium text-slate-500">Sem nichos cadastrados.</span>
            ) : (
              companyNiches.map((niche) => {
                const isSelected = niche.id === selectedNicheId;
                return (
                  <button
                    key={niche.id}
                    type="button"
                    onClick={() => setSelectedNicheId(niche.id)}
                    className={[
                      "rounded-full border px-3 py-1 text-xs font-semibold transition",
                      isSelected
                        ? "border-emerald-400 bg-emerald-50 text-emerald-800"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300",
                    ].join(" ")}
                    aria-pressed={isSelected}
                  >
                    {niche.label ?? "Nicho"}
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {selectedCompanyId ? (
        <>
          {formMode === "none" ? (
            <AuctionList
              companyId={selectedCompanyId}
              onCreate={() => {
                setEditingConfig(undefined);
                setFormMode("create");
              }}
              onSelect={(config) => {
                setMetricsConfig(config);
                setIsMetricsOpen(true);
              }}
              onEdit={(config) => {
                setEditingConfig(config);
                setFormMode("edit");
                setIsMetricsOpen(false);
              }}
            />
          ) : null}
          {formMode !== "none" ? (
            <AuctionForm
              key={editingConfig?.id ?? "new"}
              companyId={selectedCompanyId}
              config={editingConfig}
              companyCityId={selectedCompany?.city?.id ?? selectedCompany?.cityId}
              companyNiches={companyNiches}
              defaultNicheId={selectedNicheId}
              onClose={handleCloseForm}
            />
          ) : null}
          {isMetricsOpen ? (
            <div
              className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-6"
              onClick={handleCloseMetrics}
            >
              <div
                className="w-full max-w-5xl rounded-2xl bg-white p-6 shadow-xl"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Dados do leilao</p>
                    <p className="text-lg font-semibold text-slate-900">
                      {metricsNicheLabel ?? "Leilao"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCloseMetrics}
                    className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600"
                  >
                    Fechar
                  </button>
                </div>
                <div className="mt-5 space-y-5">
                  {auctionAnalyticsQuery.isError ? (
                    <Card className="border-rose-200 bg-rose-50 text-rose-800">
                      Nao foi possivel carregar os dados do leilao. Tente novamente.
                    </Card>
                  ) : auctionAnalyticsQuery.isLoading ? (
                    <Card>Carregando dados do leilao...</Card>
                  ) : (
                    <>
                      <section className="space-y-3">
                        <h2 className="text-lg font-semibold text-slate-900">Desempenho total</h2>
                        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                          <Card className="space-y-1">
                            <p className="text-xs uppercase tracking-wide text-slate-500">Impressoes</p>
                            <p className="text-2xl font-bold text-slate-900">
                              {(auctionTotals.impressions ?? 0).toLocaleString("pt-BR")}
                            </p>
                          </Card>
                          <Card className="space-y-1">
                            <p className="text-xs uppercase tracking-wide text-slate-500">Contatos</p>
                            <p className="text-2xl font-bold text-slate-900">
                              {(auctionTotals.contacts ?? 0).toLocaleString("pt-BR")}
                            </p>
                          </Card>
                          <Card className="space-y-1">
                            <p className="text-xs uppercase tracking-wide text-slate-500">Custo total</p>
                            <p className="text-2xl font-bold text-slate-900">
                              {formatCurrencyFromCents(auctionTotals.totalCostCents)}
                            </p>
                          </Card>
                          <Card className="space-y-1">
                            <p className="text-xs uppercase tracking-wide text-slate-500">Custo por contato</p>
                            <p className="text-2xl font-bold text-slate-900">
                              {formatCurrencyFromCents(auctionTotals.costPerContactCents)}
                            </p>
                          </Card>
                        </div>

                        <div className="grid gap-3 lg:grid-cols-2">
                          <Card className="space-y-2">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-semibold text-slate-900">Melhores horarios</p>
                              <span className="text-xs text-slate-500">Top 3</span>
                            </div>
                            {auctionBestHours.length === 0 ? (
                              <p className="text-sm text-slate-600">Sem dados no periodo.</p>
                            ) : (
                              <ul className="space-y-2">
                                {auctionBestHours.map((item) => (
                                  <li
                                    key={item.hour}
                                    className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"
                                  >
                                    <span className="text-sm font-semibold text-slate-900">
                                      {item.hour}h
                                    </span>
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
                            {auctionBestNiches.length === 0 ? (
                              <p className="text-sm text-slate-600">Sem dados no periodo.</p>
                            ) : (
                              <ul className="space-y-2">
                                {auctionBestNiches.map((item) => (
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
                              {(auctionAppearances?.total ?? 0).toLocaleString("pt-BR")}
                            </p>
                          </Card>
                          <Card className="space-y-1">
                            <p className="text-xs uppercase tracking-wide text-slate-500">Leilao (1-3)</p>
                            <p className="text-2xl font-bold text-slate-900">
                              {(
                                (auctionAppearances?.auction?.pos1 ?? 0) +
                                (auctionAppearances?.auction?.pos2 ?? 0) +
                                (auctionAppearances?.auction?.pos3 ?? 0)
                              ).toLocaleString("pt-BR")}
                            </p>
                          </Card>
                          <Card className="space-y-1">
                            <p className="text-xs uppercase tracking-wide text-slate-500">Organicos (4-5)</p>
                            <p className="text-2xl font-bold text-slate-900">
                              {(
                                (auctionAppearances?.organic?.pos4 ?? 0) +
                                (auctionAppearances?.organic?.pos5 ?? 0)
                              ).toLocaleString("pt-BR")}
                            </p>
                          </Card>
                          <Card className="space-y-1">
                            <p className="text-xs uppercase tracking-wide text-slate-500">Oferecido por</p>
                            <p className="text-2xl font-bold text-slate-900">
                              {(auctionAppearances?.offered ?? 0).toLocaleString("pt-BR")}
                            </p>
                          </Card>
                        </div>
                        <Card className="space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold text-slate-900">Produto buscado</p>
                            <span className="text-xs text-slate-500">Top 5</span>
                          </div>
                          {auctionAppearances?.byProduct?.length ? (
                            <ul className="space-y-2">
                              {auctionAppearances.byProduct.slice(0, 5).map((item) => (
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
                              {(auctionActions?.totalClicks ?? 0).toLocaleString("pt-BR")}
                            </p>
                          </Card>
                          <Card className="space-y-1">
                            <p className="text-xs uppercase tracking-wide text-slate-500">Cliques em ligar</p>
                            <p className="text-2xl font-bold text-slate-900">
                              {(auctionActions?.calls ?? 0).toLocaleString("pt-BR")}
                            </p>
                          </Card>
                          <Card className="space-y-1">
                            <p className="text-xs uppercase tracking-wide text-slate-500">Cliques no WhatsApp</p>
                            <p className="text-2xl font-bold text-slate-900">
                              {(auctionActions?.whatsapp ?? 0).toLocaleString("pt-BR")}
                            </p>
                          </Card>
                          <Card className="space-y-1">
                            <p className="text-xs uppercase tracking-wide text-slate-500">Taxa de acao (CTR)</p>
                            <p className="text-2xl font-bold text-slate-900">
                              {((auctionActions?.ctr ?? 0) * 100).toFixed(1)}%
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
                              <p className="text-lg font-semibold text-slate-900">
                                {auctionOrigins?.calls ?? 0}
                              </p>
                            </div>
                            <div className="rounded-lg bg-slate-50 p-3">
                              <p className="text-xs uppercase tracking-wide text-slate-500">WhatsApp</p>
                              <p className="text-lg font-semibold text-slate-900">
                                {auctionOrigins?.whatsapp ?? 0}
                              </p>
                            </div>
                            <div className="rounded-lg bg-slate-50 p-3">
                              <p className="text-xs uppercase tracking-wide text-slate-500">Web</p>
                              <p className="text-lg font-semibold text-slate-900">
                                {auctionOrigins?.web ?? 0}
                              </p>
                            </div>
                          </div>
                        </Card>
                      </section>
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-slate-500">
          Cadastre ou selecione uma empresa para gerenciar o leilao.
        </p>
      )}
    </div>
  );
};
