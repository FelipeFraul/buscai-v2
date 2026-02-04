import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { OnboardingLayout } from "./onboarding/OnboardingLayout";
import { Step1City } from "./onboarding/Step1City";
import { Step2Niches } from "./onboarding/Step2Niches";
import { Step3Products } from "./onboarding/Step3Products";
import { Step4Plan } from "./onboarding/Step4Plan";

import { useAuth } from "@/features/auth/AuthContext";

const isOnboardingComplete = () =>
  typeof window !== "undefined" &&
  localStorage.getItem("buscai_onboarding_complete") === "1";

export const OnboardingPage = () => {
  const [step, setStep] = useState(1);
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/login", { replace: true });
      return;
    }

    if (isOnboardingComplete()) {
      navigate("/dashboard", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const titles: Record<number, { title: string; description?: string }> = {
    1: { title: "Passo 1 de 4: Cidade", description: "Vamos começar pela sua cidade." },
    2: { title: "Passo 2 de 4: Nichos", description: "Escolha os nichos que você atende." },
    3: { title: "Passo 3 de 4: Produtos", description: "Produtos e serviços iniciais." },
    4: { title: "Passo 4 de 4: Plano", description: "Selecione um plano recomendado." },
  };

  const goNext = () => setStep((prev) => Math.min(prev + 1, 4));

  const renderStep = () => {
    switch (step) {
      case 1:
        return <Step1City onNext={goNext} />;
      case 2:
        return <Step2Niches onNext={goNext} />;
      case 3:
        return <Step3Products onNext={goNext} />;
      case 4:
      default:
        return (
          <Step4Plan
            onFinish={() => {
              navigate("/dashboard", { replace: true });
            }}
          />
        );
    }
  };

  return (
    <OnboardingLayout title={titles[step].title} description={titles[step].description}>
      {renderStep()}
    </OnboardingLayout>
  );
};
