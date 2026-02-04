import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

import { useOfferedByDashboard } from "./api";

export const AdminOfferedByDashboardPage = () => {
  const navigate = useNavigate();
  const params = useParams();
  const configId = params.id ?? "";
  const dashboard = useOfferedByDashboard(configId);

  const formatDayLabel = (value: string) => {
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString("pt-BR");
  };

  const maxDayEntry = useMemo(() => {
    const items = dashboard.data?.byDay ?? [];
    if (!items.length) return null;
    return items.reduce((max, item) => (item.total > max.total ? item : max), items[0]);
  }, [dashboard.data?.byDay]);

  const maxHourEntry = useMemo(() => {
    const items = dashboard.data?.byHour ?? [];
    if (!items.length) return null;
    return items.reduce((max, item) => (item.total > max.total ? item : max), items[0]);
  }, [dashboard.data?.byHour]);

  const searchTypeTotals = useMemo(() => {
    const items = dashboard.data?.bySearchType ?? [];
    const map = new Map(items.map((item) => [item.searchType, item.total]));
    return {
      company: map.get("company") ?? 0,
      product: map.get("product") ?? 0,
    };
  }, [dashboard.data?.bySearchType]);

  const nicheEntries = useMemo(
    () => (dashboard.data?.byNiche ?? []).filter((entry) => Boolean(entry.nicheId)),
    [dashboard.data?.byNiche]
  );

  const header = useMemo(() => {
    const row = dashboard.data?.config;
    if (!row) return "Dashboard do oferecido por";
    const company =
      row.company?.tradeName ?? row.company?.legalName ?? row.config.companyId;
    const city = row.city ? `${row.city.name} / ${row.city.state}` : "Todas as cidades";
    const niche = row.niche?.label ?? "Todos os nichos";
    return `${company} · ${city} · ${niche}`;
  }, [dashboard.data]);

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              Dashboard do oferecido por
            </h1>
            <p className="text-sm text-slate-600">{header}</p>
          </div>
          <Button variant="outline" onClick={() => navigate("/admin/oferecido-por")}>
            Voltar
          </Button>
        </div>

        {dashboard.isLoading ? (
          <p className="text-sm text-slate-500">Carregando indicadores...</p>
        ) : dashboard.isError ? (
          <Card className="p-4 text-sm text-slate-600">
            Nao foi possivel carregar o dashboard.
          </Card>
        ) : dashboard.data ? (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <Card className="p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Impressoes
                </p>
                <p className="text-2xl font-semibold text-slate-900">
                  {dashboard.data.totals.impressions.toLocaleString("pt-BR")}
                </p>
              </Card>
              <Card className="p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Cliques totais
                </p>
                <p className="text-2xl font-semibold text-slate-900">
                  {dashboard.data.totals.clicks.toLocaleString("pt-BR")}
                </p>
              </Card>
              <Card className="p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Cliques WhatsApp
                </p>
                <p className="text-2xl font-semibold text-slate-900">
                  {dashboard.data.totals.clicksWhatsapp.toLocaleString("pt-BR")}
                </p>
              </Card>
              <Card className="p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Cliques Ligaçao
                </p>
                <p className="text-2xl font-semibold text-slate-900">
                  {dashboard.data.totals.clicksCall.toLocaleString("pt-BR")}
                </p>
              </Card>
              <Card className="p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Cliques Site
                </p>
                <p className="text-2xl font-semibold text-slate-900">
                  {dashboard.data.totals.clicksSite.toLocaleString("pt-BR")}
                </p>
              </Card>
              <Card className="p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Cliques Promocoes
                </p>
                <p className="text-2xl font-semibold text-slate-900">
                  {dashboard.data.totals.clicksPromotions.toLocaleString("pt-BR")}
                </p>
              </Card>
              <Card className="p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Pesquisas
                </p>
                <div className="mt-3 space-y-2 text-sm text-slate-700">
                  <div className="flex justify-between">
                    <span>Pesquisa por empresa</span>
                    <span className="font-semibold">
                      {searchTypeTotals.company.toLocaleString("pt-BR")}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Pesquisa por produto</span>
                    <span className="font-semibold">
                      {searchTypeTotals.product.toLocaleString("pt-BR")}
                    </span>
                  </div>
                </div>
              </Card>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <Card className="p-4">
                <h2 className="text-sm font-semibold text-slate-900">
                  Impressoes por cidade
                </h2>
                {dashboard.data.byCity.length ? (
                  <div className="mt-3 space-y-2 text-sm text-slate-700">
                    {dashboard.data.byCity.map((city) => (
                      <div key={city.cityId ?? city.city} className="flex justify-between">
                        <span>{city.city}</span>
                        <span className="font-semibold">
                          {city.total.toLocaleString("pt-BR")}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-slate-500">
                    Nenhuma impressao registrada ainda.
                  </p>
                )}
              </Card>

              <Card className="p-4">
                <h2 className="text-sm font-semibold text-slate-900">
                  Impressoes por nicho
                </h2>
                {nicheEntries.length ? (
                  <div className="mt-3 space-y-2 text-sm text-slate-700">
                    {nicheEntries.map((niche) => (
                      <div key={niche.nicheId ?? niche.niche} className="flex justify-between">
                        <span>{niche.niche}</span>
                        <span className="font-semibold">
                          {niche.total.toLocaleString("pt-BR")}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-slate-500">
                    Nenhuma impressao registrada ainda.
                  </p>
                )}
              </Card>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <Card className="p-4">
                <h2 className="text-sm font-semibold text-slate-900">
                  Impressoes por dia
                </h2>
                {dashboard.data.byDay.length ? (
                  <div className="mt-4 space-y-2 text-sm text-slate-700">
                    {(() => {
                      const max = Math.max(
                        ...dashboard.data.byDay.map((entry) => entry.total),
                        1
                      );
                      return dashboard.data.byDay.map((item) => {
                        const percent = Math.max(
                          8,
                          Math.round((item.total / max) * 100)
                        );
                      return (
                        <div key={item.day} className="flex items-center gap-3">
                          <span className="w-28 text-xs text-slate-500">
                            {formatDayLabel(item.day)}
                          </span>
                          <div className="flex-1">
                            <div
                              className="h-2 rounded-full bg-slate-200"
                              aria-hidden="true"
                            >
                              <div
                                className="h-2 rounded-full bg-slate-700"
                                style={{ width: `${percent}%` }}
                              />
                            </div>
                          </div>
                          <span className="w-10 text-right font-semibold">
                            {item.total}
                          </span>
                        </div>
                      );
                      });
                    })()}
                    <p className="pt-2 text-xs text-slate-500">
                      Maior dia:{" "}
                      <span className="font-semibold text-slate-700">
                        {maxDayEntry ? formatDayLabel(maxDayEntry.day) : "--"}
                      </span>
                    </p>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-slate-500">
                    Nenhuma impressao registrada ainda.
                  </p>
                )}
              </Card>

              <Card className="p-4">
                <h2 className="text-sm font-semibold text-slate-900">
                  Impressoes por horario
                </h2>
                {dashboard.data.byHour.length ? (
                  <div className="mt-4 space-y-2 text-sm text-slate-700">
                    {(() => {
                      const max = Math.max(
                        ...dashboard.data.byHour.map((entry) => entry.total),
                        1
                      );
                      return dashboard.data.byHour.map((item) => {
                        const percent = Math.max(
                          8,
                          Math.round((item.total / max) * 100)
                        );
                        const label = `${String(item.hour).padStart(2, "0")}h`;
                      return (
                        <div key={item.hour} className="flex items-center gap-3">
                          <span className="w-12 text-xs text-slate-500">
                            {label}
                          </span>
                          <div className="flex-1">
                            <div
                              className="h-2 rounded-full bg-slate-200"
                              aria-hidden="true"
                            >
                              <div
                                className="h-2 rounded-full bg-slate-700"
                                style={{ width: `${percent}%` }}
                              />
                            </div>
                          </div>
                          <span className="w-10 text-right font-semibold">
                            {item.total}
                          </span>
                        </div>
                      );
                      });
                    })()}
                    <p className="pt-2 text-xs text-slate-500">
                      Maior horario:{" "}
                      <span className="font-semibold text-slate-700">
                        {maxHourEntry
                          ? `${String(maxHourEntry.hour).padStart(2, "0")}h`
                          : "--"}
                      </span>
                    </p>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-slate-500">
                    Nenhuma impressao registrada ainda.
                  </p>
                )}
              </Card>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
};
