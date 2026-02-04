import { useNavigate } from "react-router-dom";

type Step4PlanProps = {
  onFinish: () => void;
};

const STORAGE_KEY = "buscai_onboarding_complete";

const plans = [
  { title: "Plano recomendado", subtitle: "25 créditos" },
  { title: "Plano básico", subtitle: "10 créditos" },
  { title: "Plano avançado", subtitle: "50 créditos" },
  { title: "Continuar sem escolher agora", subtitle: "" },
];

export const Step4Plan = ({ onFinish }: Step4PlanProps) => {
  const navigate = useNavigate();

  const handleSelect = (plan: string) => {
    localStorage.setItem("onb_plan", plan);
    localStorage.setItem(STORAGE_KEY, "1");
    onFinish();
    navigate("/dashboard");
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-700">
        Escolha um plano recomendado ou continue sem escolher agora.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {plans.map((plan) => (
          <button
            key={plan.title}
            type="button"
            className="rounded-lg border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-slate-300"
            onClick={() => handleSelect(plan.title)}
          >
            <p className="text-sm font-semibold text-slate-900">{plan.title}</p>
            {plan.subtitle ? (
              <p className="text-xs text-slate-600">{plan.subtitle}</p>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
};
