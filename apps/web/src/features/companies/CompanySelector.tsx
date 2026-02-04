import type { components } from "@/lib/api/types";

type Company = components["schemas"]["Company"];

type CompanySelectorProps = {
  companies: Company[];
  value?: string;
  onChange?: (companyId: string) => void;
  isLoading?: boolean;
  label?: string;
};

export const CompanySelector = ({
  companies,
  value,
  onChange,
  isLoading,
  label = "Empresa",
}: CompanySelectorProps) => {
  if (isLoading) {
    return <p className="text-sm text-slate-500">Carregando empresas...</p>;
  }

  if (!companies.length) {
    return (
      <p className="text-sm text-slate-500">
        Nenhuma empresa encontrada. Cadastre uma empresa para continuar.
      </p>
    );
  }

  const selectedValue = value ?? companies[0]?.id ?? "";
  const selectedCompany =
    companies.find((company) => company.id === selectedValue) ?? companies[0];

  if (companies.length === 1) {
    return (
      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-700">{label}</label>
        <div className="flex h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700">
          {selectedCompany?.tradeName ?? "-"}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-slate-700" htmlFor="companyId">
        {label}
      </label>
      <select
        id="companyId"
        value={selectedValue}
        onChange={(event) => onChange?.(event.target.value)}
        className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
      >
        {companies.map((company) => (
          <option key={company.id} value={company.id}>
            {company.tradeName}
          </option>
        ))}
      </select>
    </div>
  );
};
