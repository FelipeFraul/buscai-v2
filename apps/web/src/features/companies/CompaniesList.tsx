import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useNiches } from "@/features/catalog/useCatalog";
import { useCompanySearch } from "@/features/public/hooks/useCompanySearch";
import type { components } from "@/lib/api/types";

import { NichesPage } from "@/app/NichesPage";
import { Step1City } from "@/app/onboarding/Step1City";
import { Step2Niches } from "@/app/onboarding/Step2Niches";
import { Step3Products } from "@/app/onboarding/Step3Products";
import { Step4Plan } from "@/app/onboarding/Step4Plan";
import {
  DashboardPage as PlaceholderDashboard,
  ProductsPanelPage,
  NichesPanelPage,
  AuctionPanelPage,
} from "@/app/PanelPlaceholders";

import { useCompanies } from "./useCompanies";

type Company = components["schemas"]["Company"];
type CompanySearchResult = NonNullable<
  components["schemas"]["SearchResponse"]["results"]
>[number];

export const CompaniesList = () => {
  const { data, isLoading } = useCompanies();
  const nichesQuery = useNiches();
  const [nicheLookup, setNicheLookup] = useState("");
  const [selectedNicheId, setSelectedNicheId] = useState("");
  const [companyContextId, setCompanyContextId] = useState("");
  const [companySearch, setCompanySearch] = useState("");
  const [onboardingStep, setOnboardingStep] = useState(1);
  const search = useCompanySearch();
  const companies: Company[] = data?.items ?? [];
  const nicheLookupResults = useMemo(() => {
    const term = nicheLookup.trim().toLowerCase();
    if (term.length < 3) {
      return [];
    }
    return (nichesQuery.data ?? []).filter((niche) =>
      niche.label.toLowerCase().includes(term)
    );
  }, [nichesQuery.data, nicheLookup]);
  const selectedCompany =
    companies.find((company) => company.id === companyContextId) ?? companies[0];
  const companySearchResults = useMemo(() => {
    const term = companySearch.trim().toLowerCase();
    if (term.length < 3) {
      return [];
    }
    return companies.filter((company) =>
      company.tradeName.toLowerCase().includes(term)
    );
  }, [companies, companySearch]);

  const handleNicheLookupChange = (value: string) => {
    setNicheLookup(value);
    const normalized = value.trim().toLowerCase();
    const match = (nichesQuery.data ?? []).find(
      (niche) => niche.label.toLowerCase() === normalized
    );
    setSelectedNicheId(match?.id ?? "");
  };

  const handleSearchCompetitors = () => {
    if (!selectedCompany?.city?.id || !selectedNicheId) {
      return;
    }
    search.mutate({
      cityId: selectedCompany.city.id,
      nicheId: selectedNicheId,
      query: undefined,
    });
  };

  if (isLoading) {
    return <p className="text-sm text-slate-500">Carregando empresas...</p>;
  }

  const onboardingTitles: Record<number, { title: string; description?: string }> = {
    1: { title: "Passo 1 de 4: Cidade", description: "Vamos comecar pela sua cidade." },
    2: { title: "Passo 2 de 4: Nichos", description: "Escolha os nichos que voce atende." },
    3: { title: "Passo 3 de 4: Produtos", description: "Produtos e servicos iniciais." },
    4: { title: "Passo 4 de 4: Plano", description: "Selecione um plano recomendado." },
  };

  const renderOnboardingStep = () => {
    switch (onboardingStep) {
      case 1:
        return <Step1City onNext={() => setOnboardingStep(2)} />;
      case 2:
        return <Step2Niches onNext={() => setOnboardingStep(3)} />;
      case 3:
        return <Step3Products onNext={() => setOnboardingStep(4)} />;
      case 4:
      default:
        return <Step4Plan onFinish={() => setOnboardingStep(1)} />;
    }
  };

  const searchResults: CompanySearchResult[] = search.data?.results ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Minhas empresas</h2>
          <p className="text-sm text-slate-500">
            {companies.length} empresas conectadas ao seu login
          </p>
        </div>
        <Button asChild>
          <Link to="/companies/new">Nova empresa</Link>
        </Button>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-3">
          <label className="text-sm font-medium text-slate-700" htmlFor="company-search">
            Buscar empresa
          </label>
          <Input
            id="company-search"
            placeholder="Digite 3 letras para buscar sua empresa"
            value={companySearch}
            onChange={(event) => setCompanySearch(event.target.value)}
            className="mt-1"
          />
        </div>
        {companySearch.trim().length < 3 ? (
          <div className="px-4 py-4 text-sm text-slate-500">
            Digite ao menos 3 letras para mostrar suas empresas.
          </div>
        ) : companySearchResults.length ? (
          companySearchResults.map((company, index) => (
            <div
              key={company.id}
              className={[
                "flex items-center justify-between gap-3 px-4 py-3 text-sm",
                index > 0 ? "border-t border-slate-100" : "",
              ].join(" ")}
            >
              <div>
                <p className="font-medium text-slate-900">{company.tradeName}</p>
                <p className="text-xs text-slate-500">
                  {company.city?.name ?? "-"}
                  {company.city?.state ? ` - ${company.city.state}` : ""}
                  {" · "}
                  {company.status}
                </p>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link to={`/companies/${company.id}`}>Editar</Link>
              </Button>
            </div>
          ))
        ) : (
          <div className="px-4 py-4 text-sm text-slate-500">
            Nenhuma empresa encontrada com esse termo.
          </div>
        )}
      </div>

      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Buscar concorrentes</h3>
          <p className="text-sm text-slate-600">
            Use o nicho para localizar concorrentes na cidade da sua empresa.
          </p>
        </div>
        {companies.length > 1 ? (
          <div className="max-w-md">
            <label className="text-sm font-medium text-slate-700" htmlFor="company-context">
              Empresa base
            </label>
            <select
              id="company-context"
              value={companyContextId || companies[0]?.id || ""}
              onChange={(event) => setCompanyContextId(event.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
            >
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.tradeName}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="max-w-xl">
          <label className="text-sm font-medium text-slate-700" htmlFor="company-niche-search">
            Nicho
          </label>
          <Input
            id="company-niche-search"
            list="company-niche-list"
            placeholder="Digite 3 letras para buscar nicho"
            value={nicheLookup}
            onChange={(event) => handleNicheLookupChange(event.target.value)}
            className="mt-1"
          />
          <datalist id="company-niche-list">
            {nicheLookupResults.map((niche) => (
              <option key={niche.id} value={niche.label} />
            ))}
          </datalist>
        </div>
        <div>
          <Button
            onClick={handleSearchCompetitors}
            disabled={!selectedCompany?.city?.id || !selectedNicheId || search.isPending}
          >
            {search.isPending ? "Buscando..." : "Buscar concorrentes"}
          </Button>
        </div>
        {search.isError ? (
          <p className="text-sm text-rose-600">
            Nao foi possivel carregar os concorrentes. Tente novamente.
          </p>
        ) : null}
        {searchResults.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {searchResults.map((result) => (
              <div
                key={result.clickTrackingId ?? `${result.position}-${result.company?.id ?? "c"}`}
                className="rounded-lg border border-slate-200 bg-slate-50 p-3"
              >
                <p className="text-sm font-semibold text-slate-900">
                  {result.company?.tradeName ?? "Empresa encontrada"}
                </p>
                <p className="text-xs text-slate-600">
                  {result.company?.city?.name ?? "-"}
                  {result.company?.city?.state ? ` - ${result.company.city.state}` : ""}
                </p>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="space-y-6">
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-4">
            <h3 className="text-base font-semibold text-slate-900">Onboarding</h3>
            <p className="text-sm text-slate-600">
              {onboardingTitles[onboardingStep]?.description}
            </p>
          </div>
          {renderOnboardingStep()}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <NichesPage />
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <PlaceholderDashboard />
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <ProductsPanelPage />
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <NichesPanelPage />
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <AuctionPanelPage />
        </section>
      </div>
    </div>
  );
};
