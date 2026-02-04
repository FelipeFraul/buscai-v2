import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { useCities, useNiches } from "@/features/catalog/useCatalog";
import { apiClient } from "@/lib/api/client";
import { formatCurrencyFromCents } from "@/lib/utils";
import type { components } from "@/lib/api/types";

import { useAuctionConfigs, useSaveAuctionConfig } from "./useAuctionConfigs";

type AuctionConfig = components["schemas"]["AuctionConfig"];
type AuctionSlotOverview = components["schemas"]["AuctionSlotOverview"];

type AuctionListProps = {
  companyId: string;
  onCreate: () => void;
  onSelect: (config: AuctionConfig) => void;
  onEdit: (config: AuctionConfig) => void;
};

export const AuctionList = ({ companyId, onCreate, onSelect, onEdit }: AuctionListProps) => {
  const { data: configs = [], isLoading } = useAuctionConfigs(companyId);
  const [selectedConfigId, setSelectedConfigId] = useState<string>();
  const saveConfig = useSaveAuctionConfig(companyId);
  const citiesQuery = useCities();
  const nichesQuery = useNiches();

  const cityMap = useMemo(
    () => new Map((citiesQuery.data ?? []).map((city) => [city.id, city])),
    [citiesQuery.data]
  );
  const nicheMap = useMemo(
    () => new Map((nichesQuery.data ?? []).map((niche) => [niche.id, niche])),
    [nichesQuery.data]
  );

  const selectedConfig = useMemo(() => {
    const hasSelection = selectedConfigId
      ? configs.some((config) => config.id === selectedConfigId)
      : false;
    const activeId = hasSelection ? selectedConfigId : configs[0]?.id;
    return configs.find((config) => config.id === activeId);
  }, [configs, selectedConfigId]);

  const slotQueries = useQueries({
    queries: configs.map((config) => ({
      queryKey: ["auction", "slots", config.cityId, config.nicheId],
      queryFn: async () => {
        const response = await apiClient.get("/auction/slots", {
          params: { cityId: config.cityId, nicheId: config.nicheId },
        });
        return response.data as AuctionSlotOverview;
      },
      enabled: Boolean(config.cityId && config.nicheId),
    })),
  });

  const handleDeactivate = (config: AuctionConfig) => {
    saveConfig.mutate({
      id: config.id,
      companyId: config.companyId,
      cityId: config.cityId,
      nicheId: config.nicheId,
      mode: config.mode ?? "manual",
      bids: config.bids,
      targetPosition: config.targetPosition,
      targetShare: config.targetShare,
      dailyBudget: config.dailyBudget,
      pauseOnLimit: config.pauseOnLimit,
      isActive: false,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900">Configuracoes de leilao</h3>
        <Button onClick={onCreate}>Criar novo Lance</Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-500">Carregando configuracoes...</p>
      ) : configs.length == 0 ? (
        <p className="text-sm text-slate-500">Nenhuma configuracao encontrada para esta empresa.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {configs.map((config, configIndex) => {
            const chosenPosition = config.mode === "auto" ? config.targetPosition ?? 1 : 1;
            const chosenBid =
              chosenPosition === 1
                ? config.bids?.position1
                : chosenPosition === 2
                  ? config.bids?.position2
                  : config.bids?.position3;
            const bidLabel =
              config.mode === "auto"
                ? "Automatico"
                : chosenBid
                  ? formatCurrencyFromCents(Math.max(100, chosenBid))
                  : "?";
            const cityLabel = cityMap.get(config.cityId)
              ? `${cityMap.get(config.cityId)?.name} - ${cityMap.get(config.cityId)?.state}`
              : config.cityId;
            const nicheLabel = nicheMap.get(config.nicheId)?.label ?? config.nicheId;
            const isSelected = config.id === selectedConfig?.id;
            const slotQuery = slotQueries[configIndex];

            return (
              <button
                key={config.id}
                type="button"
                onClick={() => {
                  setSelectedConfigId(config.id);
                  onSelect(config);
                }}
                className={[
                  "rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:-translate-y-[1px] hover:shadow-md",
                  isSelected ? "border-emerald-300 ring-1 ring-emerald-200" : "border-slate-200",
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Cidade</p>
                    <p className="text-sm font-semibold text-slate-900">{cityLabel}</p>
                    <p className="mt-2 text-xs uppercase tracking-wide text-slate-500">Nicho</p>
                    <p className="text-sm text-slate-700">{nicheLabel}</p>
                  </div>
                  {config.isActive !== false ? (
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                      Ativa
                    </span>
                  ) : (
                    <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
                      Inativa
                    </span>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-700">
                  <span>
                    Posicao escolhida: <strong className="text-emerald-700">P{chosenPosition}</strong>
                  </span>
                  <span className="font-semibold text-slate-900">Lance: {bidLabel}</span>
                </div>
                <div className="mt-4 flex items-center justify-end gap-2">
                  {config.isActive !== false ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDeactivate(config);
                      }}
                    >
                      Desativar
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(event) => {
                        event.stopPropagation();
                        saveConfig.mutate({
                          id: config.id,
                          companyId: config.companyId,
                          cityId: config.cityId,
                          nicheId: config.nicheId,
                          mode: config.mode ?? "manual",
                          bids: config.bids,
                          targetPosition: config.targetPosition,
                          targetShare: config.targetShare,
                          dailyBudget: config.dailyBudget,
                          pauseOnLimit: config.pauseOnLimit,
                          isActive: true,
                        });
                      }}
                    >
                      Ativar
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(event) => {
                      event.stopPropagation();
                      onEdit(config);
                    }}
                  >
                    Editar
                  </Button>
                </div>

                <div className="mt-4 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Slots atuais</p>
                  {slotQuery?.isLoading ? (
                    <p className="text-sm text-slate-500">Carregando slots...</p>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2">
                      {[1, 2, 3].map((position) => {
                        const slot = slotQuery?.data?.slots?.find((item) => item.position === position);
                        return (
                          <div
                            key={position}
                            className="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm"
                          >
                            <p className="text-xs font-semibold uppercase text-yellow-600">
                              Posicao paga {position}
                            </p>
                            <p className="text-slate-800">
                              {slot?.company?.tradeName ?? "Disponivel"}
                            </p>
                            <p className="text-slate-600 text-xs">
                              Lance atual:{" "}
                              {slot?.company
                                ? formatCurrencyFromCents(Math.max(100, slot?.currentBid ?? 0))
                                : "?"}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
