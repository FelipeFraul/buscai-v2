import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useCities, useNiches } from "@/features/catalog/useCatalog";

import {
  useCompanyLookup,
  useCreateOfferedByConfig,
  useOfferedByConfigs,
  useToggleOfferedByConfig,
  useUpdateOfferedByConfig,
  type OfferedByConfigPayload,
  type OfferedByConfigRow,
} from "./api";

const emptyForm: OfferedByConfigPayload = {
  companyId: "",
  cityId: null,
  nicheId: null,
  text: "",
  imageUrl: "",
  website: "",
  promotionsUrl: "",
  phoneE164: "",
  whatsappE164: "",
  isActive: true,
};

export const AdminOfferedByPage = () => {
  const navigate = useNavigate();
  const { data: configs, isLoading } = useOfferedByConfigs();
  const { data: cities } = useCities();
  const { data: niches } = useNiches();
  const createConfig = useCreateOfferedByConfig();
  const updateConfig = useUpdateOfferedByConfig();
  const toggleConfig = useToggleOfferedByConfig();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<OfferedByConfigPayload>(emptyForm);
  const [companyQuery, setCompanyQuery] = useState("");
  const companyLookupQuery = useCompanyLookup(companyQuery);
  const lookupItems = companyLookupQuery.data?.items ?? [];

  const cityMap = useMemo(
    () => new Map((cities ?? []).map((city) => [city.id, `${city.name} / ${city.state}`])),
    [cities]
  );
  const nicheMap = useMemo(
    () => new Map((niches ?? []).map((niche) => [niche.id, niche.label])),
    [niches]
  );

  useEffect(() => {
    if (!editingId) return;
    const row = configs?.find((item) => item.config.id === editingId);
    if (!row) return;
    setForm({
      companyId: row.config.companyId,
      cityId: row.config.cityId ?? null,
      nicheId: row.config.nicheId ?? null,
      text: row.config.text ?? "",
      imageUrl: row.config.imageUrl ?? "",
      website: row.config.website ?? "",
      promotionsUrl: row.config.promotionsUrl ?? "",
      phoneE164: row.config.phoneE164 ?? "",
      whatsappE164: row.config.whatsappE164 ?? "",
      isActive: row.config.isActive,
    });
    setCompanyQuery(row.company?.tradeName ?? "");
  }, [editingId, configs]);

  const updateField = <K extends keyof OfferedByConfigPayload>(key: K, value: OfferedByConfigPayload[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleImageUpload = (file?: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      updateField("imageUrl", result);
    };
    reader.readAsDataURL(file);
  };

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm);
    setCompanyQuery("");
  };

  const handleSubmit = async () => {
    if (!form.companyId) return;
    const payload = {
      ...form,
      text: form.text?.trim() || null,
      imageUrl: form.imageUrl?.trim() || null,
      website: form.website?.trim() || null,
      promotionsUrl: form.promotionsUrl?.trim() || null,
      phoneE164: form.phoneE164?.trim() || null,
      whatsappE164: form.whatsappE164?.trim() || null,
      cityId: form.cityId || null,
      nicheId: form.nicheId || null,
    };
    if (editingId) {
      await updateConfig.mutateAsync({ id: editingId, data: payload });
    } else {
      await createConfig.mutateAsync(payload);
    }
    resetForm();
  };

  const selectCompany = (row: { id: string; tradeName: string }) => {
    updateField("companyId", row.id);
    setCompanyQuery(row.tradeName);
  };

  const renderConfigTitle = (row: OfferedByConfigRow) => {
    const companyLabel =
      row.company?.tradeName ?? row.company?.legalName ?? row.config.companyId;
    const cityLabel = row.config.cityId ? cityMap.get(row.config.cityId) : "Todas as cidades";
    const nicheLabel = row.config.nicheId ? nicheMap.get(row.config.nicheId) : "Todos os nichos";
    return `${companyLabel} • ${cityLabel ?? "Cidade"} • ${nicheLabel ?? "Nicho"}`;
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Oferecido por</h1>
          <p className="text-sm text-slate-600">
            Configure quem assina o “oferecido por” e quais opcoes serao exibidas.
          </p>
        </div>

        <Card className="p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm text-slate-600 md:col-span-2">
              Empresa (busque pelo nome)
              <Input
                className="mt-1"
                value={companyQuery}
                onChange={(event) => setCompanyQuery(event.target.value)}
                placeholder="Digite pelo menos 3 letras"
              />
              {lookupItems.length > 0 ? (
                <div className="mt-2 space-y-2 rounded-xl border border-slate-200 bg-white p-3 text-xs">
                  {lookupItems.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => selectCompany(item)}
                      className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-slate-700 hover:bg-slate-100"
                    >
                      <span className="font-semibold">{item.tradeName}</span>
                      <span className="text-[11px] text-slate-500">
                        {item.city ? `${item.city.name} / ${item.city.state}` : ""}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </label>

            <label className="text-sm text-slate-600">
              Cidade (opcional)
              <select
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                value={form.cityId ?? ""}
                onChange={(event) => updateField("cityId", event.target.value || null)}
              >
                <option value="">Todas</option>
                {(cities ?? []).map((city) => (
                  <option key={city.id} value={city.id}>
                    {city.name} / {city.state}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm text-slate-600">
              Nicho (opcional)
              <select
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                value={form.nicheId ?? ""}
                onChange={(event) => updateField("nicheId", event.target.value || null)}
              >
                <option value="">Todos</option>
                {(niches ?? []).map((niche) => (
                  <option key={niche.id} value={niche.id}>
                    {niche.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm text-slate-600 md:col-span-2">
              Texto (opcional)
              <Input
                className="mt-1"
                value={form.text ?? ""}
                onChange={(event) => updateField("text", event.target.value)}
                placeholder="Ex: Oferecido por Supermercado X"
              />
            </label>

            <label className="text-sm text-slate-600 md:col-span-2">
              Image URL (opcional)
              <Input
                className="mt-1"
                value={form.imageUrl ?? ""}
                onChange={(event) => updateField("imageUrl", event.target.value)}
                placeholder="https://..."
              />
            </label>
            <label className="text-sm text-slate-600 md:col-span-2">
              Upload de imagem (opcional)
              <input
                className="mt-1 block w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                type="file"
                accept="image/*"
                onChange={(event) => handleImageUpload(event.target.files?.[0])}
              />
              <p className="mt-1 text-xs text-slate-500">
                Salva como imagem embutida (data URL) na configuracao.
              </p>
            </label>
            {form.imageUrl ? (
              <div className="md:col-span-2">
                <img
                  src={form.imageUrl}
                  alt="Preview"
                  className="mt-1 w-full max-w-sm rounded-md border border-slate-200"
                />
              </div>
            ) : null}

            <label className="text-sm text-slate-600">
              WhatsApp (E164)
              <Input
                className="mt-1"
                value={form.whatsappE164 ?? ""}
                onChange={(event) => updateField("whatsappE164", event.target.value)}
                placeholder="+5515999999999"
              />
            </label>

            <label className="text-sm text-slate-600">
              Telefone (E164)
              <Input
                className="mt-1"
                value={form.phoneE164 ?? ""}
                onChange={(event) => updateField("phoneE164", event.target.value)}
                placeholder="+5515999999999"
              />
            </label>

            <label className="text-sm text-slate-600 md:col-span-2">
              Website
              <Input
                className="mt-1"
                value={form.website ?? ""}
                onChange={(event) => updateField("website", event.target.value)}
                placeholder="https://..."
              />
            </label>

            <label className="text-sm text-slate-600 md:col-span-2">
              Promocoes (URL)
              <Input
                className="mt-1"
                value={form.promotionsUrl ?? ""}
                onChange={(event) => updateField("promotionsUrl", event.target.value)}
                placeholder="https://..."
              />
            </label>

            <label className="text-sm text-slate-600">
              Status
              <select
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                value={form.isActive ? "true" : "false"}
                onChange={(event) => updateField("isActive", event.target.value === "true")}
              >
                <option value="true">Ativo</option>
                <option value="false">Inativo</option>
              </select>
            </label>

            <div className="flex items-end gap-2">
              <Button
                className="w-full"
                onClick={handleSubmit}
                disabled={!form.companyId || createConfig.isPending || updateConfig.isPending}
              >
                {editingId ? "Atualizar" : "Salvar"}
              </Button>
              <Button variant="outline" onClick={resetForm}>
                Limpar
              </Button>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-lg font-semibold text-slate-900">Configs ativas</h2>
          {isLoading ? (
            <p className="mt-3 text-sm text-slate-500">Carregando...</p>
          ) : configs?.length ? (
            <div className="mt-4 space-y-3">
              {configs.map((row) => (
                <div
                  key={row.config.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {renderConfigTitle(row)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {row.config.text || "Sem texto personalizado"}
                    </p>
                    <p className="text-xs text-slate-500">
                      Status: {row.config.isActive ? "Ativo" : "Inativo"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/admin/oferecido-por/${row.config.id}/dashboard`)}
                    >
                      Dashboard
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingId(row.config.id)}
                    >
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        toggleConfig.mutate({
                          id: row.config.id,
                          isActive: !row.config.isActive,
                        })
                      }
                    >
                      {row.config.isActive ? "Desativar" : "Ativar"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500">Nenhuma configuracao ainda.</p>
          )}
        </Card>
      </div>
    </div>
  );
};
