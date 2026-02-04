import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/ToastProvider";
import { AuctionForm } from "@/features/auction/AuctionForm";
import { useAuctionConfigs, useAuctionSlots, useSaveAuctionConfig } from "@/features/auction/useAuctionConfigs";
import { useCities, useNiches } from "@/features/catalog/useCatalog";
import type { components } from "@/lib/api/types";
import { formatCurrencyFromCents } from "@/lib/utils";

import { useAuctionDashboard } from "./useAuctionDashboard";
import { useMeCompany } from "./useMeCompany";
import { useCompanySelection } from "@/features/companies/useCompanySelection";

type AuctionConfig = components["schemas"]["AuctionConfig"];

type CardStatus = "active" | "paused" | "no_balance" | "limit_reached";

type StatusMeta = {
  label: string;
  className: string;
};

const statusMeta: Record<CardStatus, StatusMeta> = {
  active: {
    label: "Ativo",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  paused: {
    label: "Pausado",
    className: "border-slate-200 bg-slate-100 text-slate-700",
  },
  no_balance: {
    label: "Sem saldo",
    className: "border-rose-200 bg-rose-50 text-rose-700",
  },
  limit_reached: {
    label: "Pausado por limite diario",
    className: "border-amber-200 bg-amber-50 text-amber-800",
  },
};

const Toggle = ({
  enabled,
  disabled,
  onChange,
  label,
}: {
  enabled: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) => (
  <button
    type="button"
    onClick={() => {
      if (!disabled) {
        onChange(!enabled);
      }
    }}
    aria-pressed={enabled}
    aria-label={label}
    disabled={disabled}
    className={[
      "relative inline-flex h-6 w-11 items-center rounded-full transition",
      enabled ? "bg-emerald-500" : "bg-slate-300",
      disabled ? "opacity-60 cursor-not-allowed" : "",
    ].join(" ")}
  >
    <span
      className={[
        "inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition",
        enabled ? "translate-x-5" : "translate-x-1",
      ].join(" ")}
    />
  </button>
);

const KPI = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
    <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
    <p className="text-2xl font-bold text-slate-900">{value}</p>
  </div>
);

const ProgressBar = ({ value }: { value: number }) => (
  <div className="h-2 w-full rounded-full bg-slate-100">
    <div
      className="h-2 rounded-full bg-slate-900 transition"
      style={{ width: `${value}%` }}
    />
  </div>
);

const StatusBadge = ({ status }: { status: CardStatus }) => (
  <span
    className={[
      "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold",
      statusMeta[status].className,
    ].join(" ")}
  >
    {statusMeta[status].label}
  </span>
);

export const BidsPage = () => {
  const { selectedCompanyId } = useCompanySelection();
  const { data: meCompany, isLoading: meCompanyLoading, isError: meCompanyError } =
    useMeCompany(selectedCompanyId);
  const companyId = selectedCompanyId ?? meCompany?.company?.id;
  const { pushToast } = useToast();

  const { data: configs = [], isLoading: configsLoading } = useAuctionConfigs(companyId);
  const saveAuctionConfig = useSaveAuctionConfig(companyId ?? "");
  const { data: dashboard } = useAuctionDashboard("today", companyId);
  const { data: cities = [] } = useCities();
  const { data: niches = [] } = useNiches();

  const [editingConfig, setEditingConfig] = useState<AuctionConfig | null>(null);
  const [creating, setCreating] = useState(false);
  const [savingConfigId, setSavingConfigId] = useState<string | null>(null);
  const [selectedMarketConfigId, setSelectedMarketConfigId] = useState<string | null>(null);

  const cityMap = useMemo(
    () => new Map(cities.map((city) => [city.id, `${city.name} / ${city.state}`])),
    [cities]
  );
  const nicheMap = useMemo(
    () => new Map(niches.map((niche) => [niche.id, niche.label])),
    [niches]
  );

  useEffect(() => {
    if (!selectedMarketConfigId && configs.length > 0) {
      setSelectedMarketConfigId(configs[0]?.id ?? null);
    }
  }, [configs, selectedMarketConfigId]);

  const selectedMarketConfig = useMemo(
    () => configs.find((config) => config.id === selectedMarketConfigId) ?? configs[0] ?? null,
    [configs, selectedMarketConfigId]
  );

  const marketCityId = selectedMarketConfig?.cityId;
  const marketNicheId = selectedMarketConfig?.nicheId;
  const marketSlotsQuery = useAuctionSlots(
    marketCityId && marketNicheId ? { cityId: marketCityId, nicheId: marketNicheId } : undefined
  );

  const marketSlots = useMemo(() => {
    const rawSlots = marketSlotsQuery.data?.slots ?? [];
    const slotMap = new Map<number, { bidCents: number | null; name?: string }>();

    rawSlots.forEach((slot) => {
      if (slot.position && slot.position <= 3) {
        const slotAny = slot as { companyName?: string; bidCents?: number };
        const rawBid = slotAny.bidCents ?? slot.currentBid;
        const bidCents =
          rawBid === undefined || rawBid === null ? null : Math.round(rawBid);
        slotMap.set(slot.position, {
          bidCents,
          name: slot.company?.tradeName ?? slot.company?.legalName ?? slotAny.companyName,
        });
      }
    });

    const slots = ([1, 2, 3] as const).map((position) => {
      const slot = slotMap.get(position);
      return {
        position,
        currentBidCents: slot?.bidCents ?? null,
        companyName: slot?.name,
      };
    });

    return { slots, hasMarketData: rawSlots.length > 0 };
  }, [marketSlotsQuery.data?.slots]);

  if (meCompanyLoading) {
    return <p className="text-sm text-slate-600">Carregando configuracoes...</p>;
  }

  if (meCompanyError) {
    return (
      <Card className="border-rose-200 bg-rose-50 text-rose-800">
        Nao foi possivel carregar os dados da empresa. Tente novamente mais tarde.
      </Card>
    );
  }

  if (!companyId) {
    return (
      <Card className="space-y-3 border-amber-200 bg-amber-50 text-amber-900">
        <p className="text-sm font-semibold">Crie sua empresa para ativar lances</p>
        <Button asChild>
          <Link to="/companies/new">Criar empresa</Link>
        </Button>
      </Card>
    );
  }

  const balanceCents = meCompany?.billing?.wallet?.balanceCents ?? 0;
  const reservedCents = meCompany?.billing?.wallet?.reservedCents ?? 0;
  const spentTodayCents = dashboard?.moment?.creditsSpentToday ?? 0;
  const impressionsToday = dashboard?.moment?.appearancesToday ?? 0;

  const totalNicheImpressions =
    dashboard?.niches?.reduce((total, niche) => total + niche.impressionsToday, 0) ?? 0;

  const getSpentForConfig = (nicheId?: string | null) => {
    if (!nicheId || totalNicheImpressions <= 0) {
      return 0;
    }
    const nicheMetric = dashboard?.niches?.find((item) => item.nicheId === nicheId);
    if (!nicheMetric) {
      return 0;
    }
    const share = nicheMetric.impressionsToday / totalNicheImpressions;
    return Math.round(spentTodayCents * share);
  };

  const hasBalance = balanceCents > 0;
  const hasConfigs = configs.length > 0;
  const allPaused = hasConfigs && configs.every((config) => config.isActive === false);
  const anyLimitReached = configs.some((config) => {
    const dailyBudgetCents = Math.round((config.dailyBudget ?? 0) * 100);
    if (dailyBudgetCents <= 0) {
      return false;
    }
    return getSpentForConfig(config.nicheId) >= dailyBudgetCents;
  });

  const showCreateConfigCard = !configsLoading && !hasConfigs;

  const handleCloseModal = () => {
    setCreating(false);
    setEditingConfig(null);
  };

  const handleToggle = async (config: AuctionConfig) => {
    if (!companyId || savingConfigId) {
      return;
    }
    if (!config.cityId || !config.nicheId) {
      pushToast({
        type: "error",
        title: "Configuracao invalida",
        message: "Defina cidade e nicho antes de ativar.",
      });
      return;
    }
    const isAuto = config.mode === "auto" || config.mode === "smart";
    if (isAuto && !config.targetPosition) {
      pushToast({
        type: "error",
        title: "Posicao alvo obrigatoria",
        message: "Defina a posicao alvo antes de ativar o modo automatico.",
      });
      return;
    }

    const nextActive = !(config.isActive ?? true);
    setSavingConfigId(config.id);

    try {
      await saveAuctionConfig.mutateAsync({
        companyId,
        cityId: config.cityId,
        nicheId: config.nicheId,
        mode: config.mode ?? "manual",
        isActive: nextActive,
        targetPosition: isAuto ? config.targetPosition : undefined,
        pauseOnLimit: config.pauseOnLimit ?? undefined,
        bids: {
          position1: config.bids?.position1 ?? undefined,
          position2: config.bids?.position2 ?? undefined,
          position3: config.bids?.position3 ?? undefined,
        },
        dailyBudget: config.dailyBudget ?? undefined,
        targetShare: config.targetShare ?? undefined,
      });
    } catch (error) {
      pushToast({
        type: "error",
        title: "Nao foi possivel atualizar",
        message: "Tente novamente.",
      });
    } finally {
      setSavingConfigId(null);
    }
  };

  return (
    <div className="space-y-10 pb-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Leilao</p>
          <h1 className="text-3xl font-bold text-slate-900">Configuracoes de leilao</h1>
          <p className="text-sm text-slate-600">
            Ajuste seus lances e acompanhe a disputa por posicao.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => setCreating(true)}>Nova configuracao</Button>
          <Button variant="outline" asChild>
            <Link to="/creditos">Adicionar creditos</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/configuracoes/leiloes">Ir para gestao de leilao</Link>
          </Button>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <KPI label="Saldo disponivel" value={formatCurrencyFromCents(balanceCents)} />
        <KPI label="Reservado" value={formatCurrencyFromCents(reservedCents)} />
        <KPI label="Gasto hoje" value={formatCurrencyFromCents(spentTodayCents)} />
        <KPI label="Impressoes pagas hoje" value={impressionsToday.toLocaleString("pt-BR")} />
      </section>

      <section className="space-y-3">
        {!hasBalance ? (
          <Card className="border-amber-200 bg-amber-50 text-amber-900">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Sem saldo para disputar</p>
                <p className="text-xs">Adicione creditos para ativar seus lances.</p>
              </div>
              <Button variant="outline" asChild>
                <Link to="/creditos">Comprar creditos</Link>
              </Button>
            </div>
          </Card>
        ) : null}

        {anyLimitReached ? (
          <Card className="border-amber-200 bg-amber-50 text-amber-900">
            Limite diario atingido em pelo menos um nicho.
          </Card>
        ) : null}

        {showCreateConfigCard ? (
          <Card className="border-slate-200 bg-slate-50 text-slate-700">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Sem configuracao</p>
                <p className="text-xs">Crie sua primeira configuracao para aparecer nos lances.</p>
              </div>
              <Button onClick={() => setCreating(true)}>Criar configuracao</Button>
            </div>
          </Card>
        ) : null}

        {allPaused ? (
          <Card className="border-slate-200 bg-slate-50 text-slate-700">
            Todas as configuracoes estao pausadas.
          </Card>
        ) : null}
      </section>

      <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Configuracoes</h2>
            <p className="text-sm text-slate-600">Gerencie seus lances por nicho.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
              Nova configuracao
            </Button>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {configs.map((config) => {
            const nicheLabel = nicheMap.get(config.nicheId ?? "") ?? config.nicheId ?? "Nicho";
            const cityLabel = cityMap.get(config.cityId ?? "") ?? config.cityId ?? "Cidade";
            const dailyBudgetCents = Math.round((config.dailyBudget ?? 0) * 100);
            const spentForConfigCents = getSpentForConfig(config.nicheId);
            const bidValue =
              config.bids?.position1 ??
              config.bids?.position2 ??
              config.bids?.position3 ??
              0;
            const isActive = config.isActive !== false;
            const pauseOnLimit = config.pauseOnLimit ?? true;
            const limitReached =
              pauseOnLimit && dailyBudgetCents > 0 && spentForConfigCents >= dailyBudgetCents;
            const status: CardStatus = !hasBalance
              ? "no_balance"
              : limitReached
              ? "limit_reached"
              : isActive
              ? "active"
              : "paused";

            const progressValue =
              dailyBudgetCents > 0
                ? Math.min(100, Math.round((spentForConfigCents / dailyBudgetCents) * 100))
                : 0;

            const toggleDisabled =
              status === "no_balance" || status === "limit_reached" || savingConfigId === config.id;

            const statusNote =
              status === "limit_reached"
                ? "Pausado automaticamente ao atingir o limite diario."
                : status === "no_balance"
                ? "Sem saldo disponivel para disputar."
                : status === "paused"
                ? "Pausado manualmente."
                : "";
            const isAuto = config.mode === "auto" || config.mode === "smart";

            return (
              <Card key={config.id} className="flex h-full flex-col gap-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Nicho</p>
                    <h3 className="text-lg font-semibold text-slate-900">{nicheLabel}</h3>
                    <p className="text-sm text-slate-600">{cityLabel}</p>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {isAuto ? "Automatico" : "Manual"}
                    </p>
                  </div>
                  <StatusBadge status={status} />
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <p>
                    Voce paga <span className="font-semibold text-slate-900">{formatCurrencyFromCents(bidValue)}</span> por
                    visualizacao.
                  </p>
                  {isAuto ? (
                    <p className="mt-2 text-xs text-slate-600">
                      O Automatico ajusta seu lance para disputar a posicao escolhida, enquanto houver orcamento diario disponivel.
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2 text-sm text-slate-600">
                  {dailyBudgetCents > 0 ? (
                    <>
                      <ProgressBar value={progressValue} />
                      <div className="flex items-center justify-between">
                        <span>
                          Hoje: {formatCurrencyFromCents(spentForConfigCents)} / {formatCurrencyFromCents(dailyBudgetCents)}
                        </span>
                        <span>{progressValue}%</span>
                      </div>
                    </>
                  ) : (
                    <p>Sem limite diario definido.</p>
                  )}
                  {statusNote ? <p className="text-xs text-slate-500">{statusNote}</p> : null}
                </div>

                <div className="mt-auto flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm text-slate-700">
                    <Toggle
                      enabled={isActive}
                      disabled={toggleDisabled}
                      onChange={() => handleToggle(config)}
                      label="Alternar configuracao"
                    />
                    <span>{isActive ? "Ativo" : "Pausado"}</span>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setEditingConfig(config)}>
                    Editar
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Mercado atual</h2>
            <p className="text-sm text-slate-600">Veja quem esta em 1a, 2a e 3a agora.</p>
          </div>
          {configs.length > 0 ? (
            <select
              className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm focus:border-slate-300 focus:outline-none"
              value={selectedMarketConfig?.id ?? ""}
              onChange={(event) => setSelectedMarketConfigId(event.target.value)}
              aria-label="Selecionar nicho para mercado atual"
            >
              {configs.map((config) => {
                const labelCity = cityMap.get(config.cityId ?? "") ?? "Cidade";
                const labelNiche = nicheMap.get(config.nicheId ?? "") ?? "Nicho";
                return (
                  <option key={config.id} value={config.id}>
                    {labelNiche} - {labelCity}
                  </option>
                );
              })}
            </select>
          ) : null}
        </div>

        {configs.length === 0 ? (
          <Card className="bg-slate-50 text-slate-700">
            Crie uma configuracao para acompanhar o mercado do seu nicho.
          </Card>
        ) : marketSlotsQuery.isLoading ? (
          <div className="grid gap-3 md:grid-cols-3">
            {[1, 2, 3].map((position) => (
              <div
                key={position}
                className="h-20 rounded-xl border border-slate-200 bg-slate-100 animate-pulse"
              />
            ))}
          </div>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-3">
              {marketSlots.slots.map((slot) => {
                const showValue =
                  slot.currentBidCents === null
                    ? "\u2014"
                    : `${formatCurrencyFromCents(slot.currentBidCents)} por impressao`;
                return (
                  <div
                    key={slot.position}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
                  >
                    <p className="text-xs uppercase tracking-wide text-slate-500">
                      Posicao {slot.position}
                    </p>
                    <p className="text-sm font-semibold text-slate-900">
                      Empresa: {slot.companyName ?? "\u2014"}
                    </p>
                    <p className="text-sm text-slate-700">{showValue}</p>
                  </div>
                );
              })}
            </div>
            {!marketSlots.hasMarketData ? (
              <p className="text-sm text-slate-500">Sem concorrentes nesse nicho.</p>
            ) : null}
          </>
        )}
      </section>

      <section className="space-y-3 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Dicas rapidas</h2>
          <p className="text-sm text-slate-600">Pequenos ajustes para ganhar mais visibilidade.</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          Revise seu limite diario e garanta saldo disponivel para manter sua posicao.
        </div>
      </section>

      {creating || editingConfig ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
            <AuctionForm companyId={companyId} config={editingConfig ?? undefined} onClose={handleCloseModal} />
          </div>
        </div>
      ) : null}
    </div>
  );
};
