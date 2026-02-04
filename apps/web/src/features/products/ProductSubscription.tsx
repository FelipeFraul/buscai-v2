import { useState } from "react";

import { Button } from "@/components/ui/Button";
import type { components } from "@/lib/api/types";

import { useSetProductSubscription } from "./useProductSubscription";

type ProductPlan = components["schemas"]["ProductPlan"];
type Subscription = components["schemas"]["Subscription"];

type ProductSubscriptionProps = {
  companyId?: string;
  plans?: ProductPlan[];
  isPlansLoading?: boolean;
  subscription?: Subscription | null;
  isSubscriptionLoading?: boolean;
};

export const ProductSubscription = ({
  companyId,
  plans = [],
  isPlansLoading,
  subscription,
  isSubscriptionLoading,
}: ProductSubscriptionProps) => {
  const [selectedPlanId, setSelectedPlanId] = useState<string>();

  const planOptions = plans;
  const activePlanId = subscription?.planId;
  const hasValidSelection =
    selectedPlanId && planOptions?.some((plan) => plan.id === selectedPlanId);
  const currentPlanId =
    (hasValidSelection ? selectedPlanId : undefined) ??
    activePlanId ??
    planOptions?.[0]?.id ??
    "";

  const setSubscription = useSetProductSubscription(companyId ?? "");

  const handleSubmit = () => {
    if (!companyId || !currentPlanId) {
      return;
    }

    setSubscription.mutate(
      { companyId, payload: { planId: currentPlanId } },
      {
        onSuccess: () => {
          setSelectedPlanId(undefined);
        },
      }
    );
  };

  if (!companyId) {
    return (
      <p className="text-sm text-slate-500">
        Selecione uma empresa para gerenciar a assinatura de ofertas.
      </p>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 p-4">
      <div>
        <h3 className="text-lg font-semibold text-slate-900">
          Assinatura de ofertas
        </h3>
        {isSubscriptionLoading ? (
          <p className="text-sm text-slate-500">Carregando assinatura...</p>
        ) : subscription ? (
          <p className="text-sm text-slate-600">
            Plano atual:{" "}
            <span className="font-semibold">
              {subscription.plan?.name ?? subscription.planId}
            </span>{" "}
            ({subscription.status})
          </p>
        ) : (
          <p className="text-sm text-slate-600">
            Nenhuma assinatura ativa no momento.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="plan">
          Selecionar plano
        </label>
        <select
          id="plan"
          value={currentPlanId}
          onChange={(event) => setSelectedPlanId(event.target.value)}
          className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
          disabled={isPlansLoading || !planOptions.length}
        >
          {planOptions.length === 0 ? (
            <option value="">Nenhum plano disponivel</option>
          ) : (
            planOptions.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name} - {plan.maxActiveOffers} ofertas
              </option>
            ))
          )}
        </select>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          Uma assinatura ativa e necessaria para cadastrar ofertas.
        </p>
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={
            !companyId ||
            !currentPlanId ||
            !planOptions.length ||
            setSubscription.isPending
          }
        >
          {setSubscription.isPending ? "Salvando..." : "Salvar plano"}
        </Button>
      </div>
    </div>
  );
};
