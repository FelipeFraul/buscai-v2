import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { queryClient } from "@/lib/api/queryClient";
import type { components } from "@/lib/api/types";
import { formatCurrencyFromCents } from "@/lib/utils";

import { useSaveAuctionConfig, useAuctionSlots, useAuctionSummary } from "./useAuctionConfigs";

type AuctionConfig = components["schemas"]["AuctionConfig"];
type CompanyNiche = NonNullable<components["schemas"]["Company"]["niches"]>[number];

type AuctionFormProps = {
  companyId: string;
  config?: AuctionConfig;
  companyCityId?: string;
  companyNiches?: CompanyNiche[];
  defaultNicheId?: string;
  onClose: () => void;
};

const formatMoney = (value: string) => value.replace(",", ".");

const parseNumber = (value: string) => {
  if (!value.trim()) {
    return undefined;
  }
  const parsed = Number(formatMoney(value));
  return Number.isNaN(parsed) ? undefined : parsed;
};

const BID_STEP_CENTS = 50;

const roundUpToStep = (value: number, step: number) =>
  Math.ceil(value / step) * step;

const toInputValueFromCents = (value?: number | null) => {
  if (value === null || value === undefined) {
    return "";
  }
  return (value / 100).toFixed(2);
};

const parseCurrencyToCents = (value: string) => {
  const parsed = parseNumber(value);
  if (parsed === undefined) {
    return undefined;
  }
  return Math.round(parsed * 100);
};

const normalizeBidCents = (value: string) => {
  const cents = parseCurrencyToCents(value);
  if (cents === undefined) {
    return undefined;
  }
  const normalized = roundUpToStep(cents, BID_STEP_CENTS);
  return Math.max(100, normalized);
};

const Toggle = ({
  enabled,
  onChange,
  label,
}: {
  enabled: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) => (
  <button
    type="button"
    onClick={() => onChange(!enabled)}
    aria-pressed={enabled}
    aria-label={label}
    className={[
      "relative inline-flex h-6 w-11 items-center rounded-full transition",
      enabled ? "bg-emerald-500" : "bg-slate-300",
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

export const AuctionForm = ({
  companyId,
  config,
  companyCityId,
  companyNiches,
  defaultNicheId,
  onClose,
}: AuctionFormProps) => {
  const isEditing = Boolean(config);
  const [cityId, setCityId] = useState(() => config?.cityId ?? companyCityId ?? "");
  const [nicheId, setNicheId] = useState(
    () => config?.nicheId ?? defaultNicheId ?? companyNiches?.[0]?.id ?? ""
  );
  const [mode, setMode] = useState<AuctionConfig["mode"]>(
    (config?.mode === "smart" ? "auto" : config?.mode ?? "manual") as AuctionConfig["mode"]
  );
  const [targetPosition, setTargetPosition] = useState(() =>
    config?.targetPosition ? String(config.targetPosition) : "1"
  );

  const [baseBid, setBaseBid] = useState(() =>
    config?.bids?.position1 ? toInputValueFromCents(config.bids.position1) : "1.00"
  );
  const [dailyBudget, setDailyBudget] = useState(() =>
    config?.dailyBudget ? toInputValueFromCents(config.dailyBudget) : ""
  );
  const [pauseOnLimit, setPauseOnLimit] = useState(() => config?.pauseOnLimit ?? true);
  const [isActive, setIsActive] = useState(() => config?.isActive ?? true);

  const saveAuctionConfig = useSaveAuctionConfig(companyId);
  const slotsQuery = useAuctionSlots(cityId && nicheId ? { cityId, nicheId } : undefined);
  const summaryQuery = useAuctionSummary(
    mode === "auto" && cityId && nicheId ? { cityId, nicheId } : undefined
  );

  const nicheOptions = useMemo(() => companyNiches ?? [], [companyNiches]);
  const marketSlots = useMemo(() => {
    const rawSlots = slotsQuery.data?.slots ?? [];
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
  }, [slotsQuery.data?.slots]);

  const targetPositionValue = Math.max(1, Math.min(3, Number(targetPosition)));
  const referenceSlot =
    marketSlots.slots.find((slot) => slot.position === targetPositionValue) ??
    marketSlots.slots[0];
  const referenceCents = referenceSlot?.currentBidCents ?? null;
  const estimateCents =
    referenceCents === null ? null : roundUpToStep(referenceCents + 1, BID_STEP_CENTS);

  useEffect(() => {
    if (!isEditing && companyCityId) {
      setCityId(companyCityId);
    }
  }, [companyCityId, isEditing]);

  useEffect(() => {
    if (isEditing) {
      return;
    }
    if (!nicheOptions.length) {
      setNicheId("");
      return;
    }
    if (nicheOptions.some((niche) => niche.id === nicheId)) {
      return;
    }
    setNicheId(defaultNicheId ?? nicheOptions[0]?.id ?? "");
  }, [defaultNicheId, isEditing, nicheId, nicheOptions]);

  const buildPayload = (overrideActive?: boolean) => {
    const parsedDailyBudget = parseCurrencyToCents(dailyBudget);
    if (!parsedDailyBudget || parsedDailyBudget <= 0) {
      return null;
    }
    const manualBid = normalizeBidCents(baseBid);
    const position2Value = config?.bids?.position2;
    const position3Value = config?.bids?.position3;
    const targetPositionValue =
      mode === "auto" ? Math.max(1, Math.min(3, Number(targetPosition))) : undefined;

    return {
      id: config?.id,
      companyId,
      cityId,
      nicheId,
      mode: mode ?? "manual",
      isActive: overrideActive ?? isActive,
      targetPosition: mode === "auto" ? targetPositionValue : undefined,
      pauseOnLimit,
      bids: {
        position1: manualBid,
        position2: position2Value,
        position3: position3Value,
      },
      dailyBudget: parsedDailyBudget,
      targetShare: config?.targetShare ?? undefined,
    };
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!cityId || !nicheId) {
      return;
    }

    const payload = buildPayload();
    if (!payload) {
      return;
    }

    saveAuctionConfig.mutate(payload, {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: ["auction", "slots"],
          exact: false,
        });
        onClose();
      },
    });
  };

  const handlePause = () => {
    if (!cityId || !nicheId) {
      return;
    }
    setIsActive(false);
    const payload = buildPayload(false);
    if (!payload) {
      return;
    }
    saveAuctionConfig.mutate(payload, {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: ["auction", "slots"],
          exact: false,
        });
        onClose();
      },
    });
  };

  const handleBaseBidBlur = () => {
    if (!baseBid.trim()) {
      return;
    }
    const normalized = normalizeBidCents(baseBid);
    if (normalized === undefined) {
      return;
    }
    setBaseBid(toInputValueFromCents(normalized));
  };

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <div className="flex items-center justify-between">
        <h4 className="text-base font-semibold text-slate-800">
          {isEditing ? "Editar lance" : "Novo lance"}
        </h4>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Fechar
        </Button>
      </div>

      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Modo de lance</p>
          <p className="text-sm font-semibold text-slate-900">Escolha a forma de participar</p>
        </div>
        <div role="radiogroup" className="grid gap-3 md:grid-cols-2">
          <button
            type="button"
            role="radio"
            aria-checked={mode === "manual"}
            onClick={() => setMode("manual")}
            className={[
              "rounded-2xl border px-4 py-3 text-left transition",
              mode === "manual"
                ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                : "border-slate-200 bg-white text-slate-900 hover:border-slate-300",
            ].join(" ")}
          >
            <p className="text-sm font-semibold">Manual</p>
            <p className={mode === "manual" ? "text-xs text-slate-200" : "text-xs text-slate-500"}>
              Para quem quer definir o valor exato
            </p>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === "auto"}
            onClick={() => setMode("auto")}
            className={[
              "rounded-2xl border px-4 py-3 text-left transition",
              mode === "auto"
                ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                : "border-slate-200 bg-white text-slate-900 hover:border-slate-300",
            ].join(" ")}
          >
            <p className="text-sm font-semibold">Automatico</p>
            <p className={mode === "auto" ? "text-xs text-slate-200" : "text-xs text-slate-500"}>
              Recomendado para comecar rapido
            </p>
          </button>
        </div>
        {mode === "auto" ? (
          <p className="text-sm text-slate-600">
            O Automatico ajusta seu lance para disputar a posicao escolhida, enquanto houver orcamento diario disponivel.
          </p>
        ) : null}
      </div>

      <div className="space-y-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Configuracao principal</p>
        </div>

        {mode === "manual" ? (
          <div className="space-y-4">
            <div>
              <p className="text-sm text-slate-600">Quanto voce aceita pagar por visualizacao?</p>
            </div>
            <Input
              id="baseBid"
              type="number"
              min="1"
              step="0.5"
              value={baseBid}
              onChange={(event) => setBaseBid(event.target.value)}
              onBlur={handleBaseBidBlur}
              placeholder="R$ 0,00"
              required
            />

            <div className="flex flex-wrap gap-2">
              {[
                { label: "Conservador", value: "1.50" },
                { label: "Competitivo", value: "3.00" },
                { label: "Agressivo", value: "5.00" },
              ].map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => setBaseBid(chip.value)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  {chip.label}
                </button>
              ))}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Mercado atual</p>
                  <p className="text-xs text-slate-500">
                    Veja quem esta em 1a, 2a e 3a agora.
                  </p>
                </div>
                {!marketSlots.hasMarketData ? (
                  <span className="text-xs font-medium text-slate-500">
                    Sem concorrentes nesse nicho
                  </span>
                ) : null}
              </div>
              {slotsQuery.isLoading ? (
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {[1, 2, 3].map((position) => (
                    <div
                      key={position}
                      className="h-20 rounded-xl border border-slate-200 bg-slate-100 animate-pulse"
                    />
                  ))}
                </div>
              ) : (
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {marketSlots.slots.map((slot) => {
                    const hasCompany = Boolean(slot.companyName);
                    const rawBid = slot.currentBidCents ?? 0;
                    const normalizedBid = roundUpToStep(rawBid, BID_STEP_CENTS);
                    const displayBid = hasCompany
                      ? Math.max(100, normalizedBid)
                      : 0;
                    const showValue = `${formatCurrencyFromCents(displayBid)} por impressao`;
                    return (
                      <div
                        key={slot.position}
                        className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
                      >
                        <p className="text-xs uppercase tracking-wide text-slate-500">
                          Posicao {slot.position}
                        </p>
                        <p className="text-sm font-semibold text-slate-900">
                          Empresa: {hasCompany ? slot.companyName : "\u2014"}
                        </p>
                        <p className="text-sm text-slate-700">
                          {showValue}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
              {!slotsQuery.isLoading && !marketSlots.hasMarketData ? (
                <p className="mt-3 text-sm text-slate-500">
                  Sem concorrentes nesse nicho.
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {mode === "auto" ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold text-slate-900">Como funciona</p>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                <li className="flex items-start gap-2">
                  <span className="mt-2 h-2 w-2 rounded-full bg-slate-300" />
                  <span>Voce escolhe a posicao (1, 2 ou 3)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-2 h-2 w-2 rounded-full bg-slate-300" />
                  <span>O sistema usa o mercado atual como referencia e ajusta o lance para manter a posicao</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-2 h-2 w-2 rounded-full bg-slate-300" />
                  <span>A cobranca continua sendo por impressao (quando exibido como patrocinado)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-2 h-2 w-2 rounded-full bg-slate-300" />
                  <span>O limite diario pausa a participacao quando atingir o teto do dia (se habilitado)</span>
                </li>
              </ul>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Mercado atual</p>
                  <p className="text-xs text-slate-500">
                    Veja quem esta em 1a, 2a e 3a agora.
                  </p>
                </div>
                {!marketSlots.hasMarketData ? (
                  <span className="text-xs font-medium text-slate-500">
                    Sem concorrentes nesse nicho
                  </span>
                ) : null}
              </div>
              {slotsQuery.isLoading ? (
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {[1, 2, 3].map((position) => (
                    <div
                      key={position}
                      className="h-20 rounded-xl border border-slate-200 bg-slate-100 animate-pulse"
                    />
                  ))}
                </div>
              ) : (
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {marketSlots.slots.map((slot) => {
                    const hasCompany = Boolean(slot.companyName);
                    const rawBid = slot.currentBidCents ?? 0;
                    const normalizedBid = roundUpToStep(rawBid, BID_STEP_CENTS);
                    const displayBid = hasCompany
                      ? Math.max(100, normalizedBid)
                      : 0;
                    const showValue = `${formatCurrencyFromCents(displayBid)} por impressao`;
                    return (
                      <button
                        type="button"
                        key={slot.position}
                        onClick={() => setTargetPosition(String(slot.position))}
                        className={[
                          "rounded-xl border px-4 py-3 text-left transition",
                          Number(targetPosition) === slot.position
                            ? "border-slate-900 bg-white shadow-sm"
                            : "border-slate-200 bg-slate-50 hover:bg-white",
                        ].join(" ")}
                      >
                        <p className="text-xs uppercase tracking-wide text-slate-500">
                          Posicao {slot.position}
                        </p>
                        <p className="text-sm font-semibold text-slate-900">
                          Empresa: {hasCompany ? slot.companyName : "\u2014"}
                        </p>
                        <p className="text-sm text-slate-700">
                          {showValue}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
              {!slotsQuery.isLoading && !marketSlots.hasMarketData ? (
                <p className="mt-3 text-sm text-slate-500">
                  Sem concorrentes nesse nicho.
                </p>
              ) : null}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="max-w-xs space-y-1">
                  <label className="text-sm font-medium text-slate-700" htmlFor="targetPosition">
                    Posicao alvo
                  </label>
                  <select
                    id="targetPosition"
                    value={targetPosition}
                    onChange={(event) => setTargetPosition(event.target.value)}
                    className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                    required
                  >
                    <option value="1">1a posicao</option>
                    <option value="2">2a posicao</option>
                    <option value="3">3a posicao</option>
                  </select>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Estimativa para manter</p>
                  <p className="text-sm font-semibold text-slate-900">
                    {estimateCents === null ? "\u2014" : `${formatCurrencyFromCents(estimateCents)} por impressao`}
                  </p>
                  <p className="text-xs text-slate-500">
                    Referencia: {referenceCents === null ? "\u2014" : formatCurrencyFromCents(referenceCents)}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-sm text-slate-600">
                O Automatico ajusta seu lance para disputar a posicao escolhida, enquanto houver orcamento diario disponivel.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Metricas do automatico</p>
                  <p className="text-sm text-slate-600">
                    Acompanhe o desempenho de hoje e o status atual.
                  </p>
                </div>
              </div>
              {summaryQuery.isLoading ? (
                <p className="mt-3 text-sm text-slate-500">Carregando metricas...</p>
              ) : (
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Hoje</p>
                    <p>
                      Gasto:{" "}
                      <span className="font-semibold text-slate-900">
                        {formatCurrencyFromCents(summaryQuery.data?.todaySpentCents ?? 0)}
                      </span>
                    </p>
                    <p>
                      Impressoes pagas:{" "}
                      <span className="font-semibold text-slate-900">
                        {(summaryQuery.data?.todayImpressionsPaid ?? 0).toLocaleString("pt-BR")}
                      </span>
                    </p>
                    <p>
                      Cliques:{" "}
                      <span className="font-semibold text-slate-900">
                        {(summaryQuery.data?.todayClicks ?? 0).toLocaleString("pt-BR")}
                      </span>
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Eficiencia</p>
                    <p>
                      CTR:{" "}
                      <span className="font-semibold text-slate-900">
                        {summaryQuery.data?.ctr !== null && summaryQuery.data?.ctr !== undefined
                          ? `${(summaryQuery.data.ctr * 100).toFixed(1)}%`
                          : "\u2014"}
                      </span>
                    </p>
                    <p>
                      Posicao media paga:{" "}
                      <span className="font-semibold text-slate-900">
                        {summaryQuery.data?.avgPaidPosition !== null &&
                        summaryQuery.data?.avgPaidPosition !== undefined
                          ? summaryQuery.data.avgPaidPosition.toFixed(1)
                          : "\u2014"}
                      </span>
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Status</p>
                    <p className="font-semibold text-slate-900">
                      {summaryQuery.data?.status === "paused_by_limit"
                        ? "Pausado por limite diario"
                        : summaryQuery.data?.status === "insufficient_balance"
                        ? "Sem saldo"
                        : summaryQuery.data?.status === "paused"
                        ? "Pausado"
                        : "Ativo"}
                    </p>
                    <p className="text-xs text-slate-500">
                      Saldo atual:{" "}
                      {formatCurrencyFromCents(summaryQuery.data?.walletBalanceCents ?? 0)}{" "}
                      | Reservado:{" "}
                      {formatCurrencyFromCents(summaryQuery.data?.walletReservedCents ?? 0)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Protecoes</p>
          <p className="text-sm text-slate-600">Controle o quanto gastar por dia.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700" htmlFor="dailyBudget">
              Limite diario (R$)
            </label>
            <Input
              id="dailyBudget"
              type="number"
              min="0"
              step="0.01"
              value={dailyBudget}
              onChange={(event) => setDailyBudget(event.target.value)}
              required
            />
          </div>
          <div className="flex items-center gap-3">
            <Toggle
              enabled={pauseOnLimit}
              onChange={setPauseOnLimit}
              label="Pausar ao atingir limite"
            />
            <div>
              <p className="text-sm font-semibold text-slate-900">Pausar ao atingir limite</p>
              <p className="text-xs text-slate-500">Nunca gastara mais que isso no dia.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <div className="flex flex-wrap gap-2">
          {isEditing ? (
            <Button type="button" variant="outline" onClick={handlePause}>
              Pausar anuncio
            </Button>
          ) : null}
          <Button type="submit" disabled={saveAuctionConfig.isPending}>
            {saveAuctionConfig.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </div>
    </form>
  );
};
