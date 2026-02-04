import type { components } from "@/lib/api/types";

type ProductPlan = components["schemas"]["ProductPlan"];

type ProductPlansProps = {
  plans?: ProductPlan[];
  isLoading?: boolean;
  activePlanId?: string;
};

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export const ProductPlans = ({
  plans = [],
  isLoading,
  activePlanId,
}: ProductPlansProps) => {
  if (isLoading) {
    return <p className="text-sm text-slate-500">Carregando planos...</p>;
  }

  if (!plans.length) {
    return (
      <p className="text-sm text-slate-500">
        Nenhum plano de produtos esta disponivel no momento.
      </p>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {plans.map((plan) => {
        const isActive = plan.id === activePlanId;
        return (
          <div
            key={plan.id}
            className={`rounded-lg border p-4 ${
              isActive ? "border-brand-500" : "border-slate-200"
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="text-base font-semibold text-slate-900">
                {plan.name}
              </p>
              {isActive ? (
                <span className="rounded-full bg-brand-500/10 px-2 py-0.5 text-xs font-semibold text-brand-600">
                  Ativo
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-sm text-slate-600">{plan.description}</p>
            <dl className="mt-4 space-y-1 text-sm text-slate-700">
              <div className="flex justify-between">
                <dt>Preco mensal</dt>
                <dd>{currency.format((plan.monthlyPriceCents ?? 0) / 100)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Ofertas ativas</dt>
                <dd>{plan.maxActiveOffers}</dd>
              </div>
            </dl>
          </div>
        );
      })}
    </div>
  );
};
