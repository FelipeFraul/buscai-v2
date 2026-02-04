import { useMemo } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useCities, useNiches } from "@/features/catalog/useCatalog";

export type AdminCompanyFormState = {
  name: string;
  cityId: string;
  nicheId: string;
  addressLine: string;
  phoneE164: string;
  whatsappE164: string;
  website: string;
  lat: string;
  lng: string;
  origin: "manual" | "serpapi" | "claimed";
  qualityScore: string;
  status: "draft" | "pending" | "active" | "suspended";
};

type Props = {
  value: AdminCompanyFormState;
  onChange: (next: AdminCompanyFormState) => void;
  onSubmit: () => void;
  submitLabel: string;
  loading?: boolean;
  showStatus?: boolean;
};

export const AdminCompanyForm = ({ value, onChange, onSubmit, submitLabel, loading, showStatus }: Props) => {
  const citiesQuery = useCities();
  const nichesQuery = useNiches();

  const contactMissing = useMemo(
    () => !value.phoneE164.trim() && !value.whatsappE164.trim(),
    [value.phoneE164, value.whatsappE164]
  );

  const handleField = (key: keyof AdminCompanyFormState, fieldValue: string) => {
    onChange({ ...value, [key]: fieldValue });
  };

  return (
    <form
      className="grid gap-4 rounded-2xl bg-white p-6 shadow-sm md:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label className="text-sm text-slate-600 md:col-span-2">
        Nome
        <Input
          className="mt-1"
          value={value.name}
          onChange={(event) => handleField("name", event.target.value)}
          required
        />
      </label>
      <label className="text-sm text-slate-600">
        Cidade
        <select
          className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
          value={value.cityId}
          onChange={(event) => handleField("cityId", event.target.value)}
          required
          disabled={citiesQuery.isLoading}
        >
          <option value="">Selecione</option>
          {(citiesQuery.data ?? []).map((city) => (
            <option key={city.id} value={city.id}>
              {city.name} / {city.state}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm text-slate-600">
        Nicho
        <select
          className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
          value={value.nicheId}
          onChange={(event) => handleField("nicheId", event.target.value)}
          required
          disabled={nichesQuery.isLoading}
        >
          <option value="">Selecione</option>
          {(nichesQuery.data ?? []).map((niche) => (
            <option key={niche.id} value={niche.id}>
              {niche.label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm text-slate-600 md:col-span-2">
        Endereco
        <Input
          className="mt-1"
          value={value.addressLine}
          onChange={(event) => handleField("addressLine", event.target.value)}
          required
        />
      </label>
      <label className="text-sm text-slate-600">
        Telefone (E164)
        <Input
          className="mt-1"
          value={value.phoneE164}
          onChange={(event) => handleField("phoneE164", event.target.value)}
          placeholder="+5515999999999"
        />
      </label>
      <label className="text-sm text-slate-600">
        WhatsApp (E164)
        <Input
          className="mt-1"
          value={value.whatsappE164}
          onChange={(event) => handleField("whatsappE164", event.target.value)}
          placeholder="+5515999999999"
        />
      </label>
      <label className="text-sm text-slate-600 md:col-span-2">
        Website
        <Input
          className="mt-1"
          value={value.website}
          onChange={(event) => handleField("website", event.target.value)}
          placeholder="https://"
        />
      </label>
      <label className="text-sm text-slate-600">
        Latitude
        <Input
          className="mt-1"
          type="number"
          value={value.lat}
          onChange={(event) => handleField("lat", event.target.value)}
        />
      </label>
      <label className="text-sm text-slate-600">
        Longitude
        <Input
          className="mt-1"
          type="number"
          value={value.lng}
          onChange={(event) => handleField("lng", event.target.value)}
        />
      </label>
      <label className="text-sm text-slate-600">
        Origem
        <select
          className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
          value={value.origin}
          onChange={(event) => handleField("origin", event.target.value)}
        >
          <option value="manual">Manual</option>
          <option value="serpapi">SerpAPI</option>
          <option value="claimed">Claimed</option>
        </select>
      </label>
      <label className="text-sm text-slate-600">
        Qualidade
        <Input
          className="mt-1"
          type="number"
          value={value.qualityScore}
          onChange={(event) => handleField("qualityScore", event.target.value)}
          placeholder="Auto"
          readOnly
          disabled
          min={0}
          max={100}
        />
      </label>
      {showStatus ? (
        <label className="text-sm text-slate-600">
          Status
          <select
            className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            value={value.status}
            onChange={(event) => handleField("status", event.target.value)}
          >
            <option value="draft">Draft</option>
            <option value="pending">Pending</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
        </label>
      ) : null}
      <div className="md:col-span-2">
        {contactMissing && (
          <p className="mb-2 text-xs text-rose-600">
            Informe ao menos um contato (telefone ou WhatsApp).
          </p>
        )}
        <Button type="submit" disabled={loading || contactMissing}>
          {loading ? "Salvando..." : submitLabel}
        </Button>
      </div>
    </form>
  );
};
