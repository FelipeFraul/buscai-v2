import { useEffect, useMemo, useState, type FormEvent } from "react";
import axios from "axios";
import { useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useCities, useNiches } from "@/features/catalog/useCatalog";
import { useAuth } from "@/features/auth/AuthContext";
import { apiClient } from "@/lib/api/client";

import { useCompany } from "./useCompany";
import { useSaveCompany } from "./useSaveCompany";

export const CompanyForm = () => {
  const { companyId } = useParams();
  const isCreating = !companyId || companyId === "new";
  const navigate = useNavigate();
  const { data, isLoading } = useCompany(isCreating ? undefined : companyId);
  const citiesQuery = useCities();
  const nichesQuery = useNiches();
  const saveCompany = useSaveCompany();
  const { refreshToken, setSession, user } = useAuth();
  const queryClient = useQueryClient();

  const [tradeNameOverride, setTradeNameOverride] = useState<string | null>(null);
  const [legalNameOverride, setLegalNameOverride] = useState<string | null>(null);
  const [cityIdOverride, setCityIdOverride] = useState<string | null>(null);
  const [nicheSelectionOverride, setNicheSelectionOverride] = useState<string[] | null>(null);
  const [addressOverride, setAddressOverride] = useState<string | null>(null);
  const [phoneOverride, setPhoneOverride] = useState<string | null>(null);
  const [whatsappOverride, setWhatsappOverride] = useState<string | null>(null);
  const [openingHoursOverride, setOpeningHoursOverride] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [nicheSearch, setNicheSearch] = useState("");
  const [isCreatingNiche, setIsCreatingNiche] = useState(false);
  const [createNicheError, setCreateNicheError] = useState<string | null>(null);

  const tradeName =
    tradeNameOverride ??
    (isCreating ? "" : data?.tradeName ?? "");
  const legalName =
    legalNameOverride ??
    (isCreating ? "" : data?.legalName ?? "");
  const cityInput = isCreating
    ? cityIdOverride ?? ""
    : data?.city?.id ?? "";
  const address =
    addressOverride ??
    (isCreating ? "" : data?.channels?.address ?? "");
  const phone =
    phoneOverride ??
    (isCreating ? "" : data?.channels?.phone ?? "");
  const whatsapp =
    whatsappOverride ??
    (isCreating ? "" : data?.channels?.whatsapp ?? "");
  const openingHours =
    openingHoursOverride ??
    (isCreating ? "" : data?.channels?.openingHours ?? "");
  const cityOptions = useMemo(() => citiesQuery.data ?? [], [citiesQuery.data]);

  useEffect(() => {
    if (!isCreating || cityIdOverride) {
      return;
    }
    if (cityOptions.length === 1) {
      setCityIdOverride(cityOptions[0].id);
    }
  }, [isCreating, cityIdOverride, cityOptions]);
  const filteredNiches = useMemo(() => {
    const term = nicheSearch.trim().toLowerCase();
    const niches = nichesQuery.data ?? [];
    if (term.length < 3) return [];
    return niches.filter((niche) => niche.label.toLowerCase().includes(term));
  }, [nicheSearch, nichesQuery.data]);
  const canCreateNiche =
    nicheSearch.trim().length >= 3 && filteredNiches.length === 0 && !isCreatingNiche;
  const handleCreateNiche = async () => {
    const label = nicheSearch.trim();
    if (!label) return;
    setIsCreatingNiche(true);
    setCreateNicheError(null);
    try {
      const response = await apiClient.post("/admin/serpapi/niches", { label });
      const created = response.data as { id: string; label: string } | null;
      await queryClient.invalidateQueries({ queryKey: ["catalog", "niches"] });
      if (created?.id) {
        setNicheSelectionOverride((prev) => {
          const current = prev ?? [];
          return current.includes(created.id) ? current : [...current, created.id];
        });
        setNicheSearch(created.label ?? label);
      }
    } catch {
      setCreateNicheError("Nao foi possivel adicionar o nicho.");
    } finally {
      setIsCreatingNiche(false);
    }
  };
  const nicheSelection = useMemo(
    () =>
      nicheSelectionOverride ??
      (isCreating ? [] : data?.niches?.map((n) => n.id) ?? []),
    [nicheSelectionOverride, isCreating, data]
  );
  const channelsPayload = useMemo(() => {
    const payload = {
      address: address.trim() || undefined,
      phone: phone.trim() || undefined,
      whatsapp: whatsapp.trim() || undefined,
      openingHours: openingHours.trim() || undefined,
    };
    const hasAny = Object.values(payload).some(Boolean);
    return { payload, hasAny };
  }, [address, phone, whatsapp, openingHours]);

  if (!isCreating && isLoading) {
    return <p className="text-sm text-slate-500">Carregando empresa...</p>;
  }

  if (!isCreating && !data) {
    return <p className="text-sm text-red-600">Empresa nao encontrada.</p>;
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setStatusMessage(null);
    setErrorDetails(null);

    if (isCreating) {
      if (!cityInput) {
        setStatusMessage("Informe o ID de uma cidade valida.");
        return;
      }

      saveCompany.mutate(
        {
          payload: {
            tradeName,
            legalName: legalName || undefined,
            cityId: cityInput,
            nicheIds: nicheSelection.length ? nicheSelection : undefined,
            channels: channelsPayload.hasAny ? channelsPayload.payload : undefined,
          },
        },
        {
          onSuccess: async () => {
            setStatusMessage("Empresa criada com sucesso.");
            if (refreshToken) {
              try {
                const response = await apiClient.post("/auth/refresh", { refreshToken });
                const nextAccessToken = response.data?.accessToken as string | undefined;
                const nextRefreshToken = response.data?.refreshToken as string | undefined;
                if (nextAccessToken) {
                  setSession({
                    accessToken: nextAccessToken,
                    refreshToken: nextRefreshToken ?? refreshToken,
                    user,
                  });
                }
              } catch {
                // ignore refresh failure; user can re-login if needed
              }
            }
            navigate("/companies");
          },
          onError: (error) => {
            if (axios.isAxiosError(error)) {
              const status = error.response?.status;
              const data = error.response?.data as
                | { message?: string; error?: string | { message?: string } }
                | undefined;
              const message =
                data?.message ??
                (typeof data?.error === "string" ? data.error : data?.error?.message);
              setErrorDetails(
                status
                  ? `Erro ${status}${message ? `: ${message}` : ""}`
                  : message ?? "Erro desconhecido ao salvar."
              );
            } else {
              setErrorDetails("Erro desconhecido ao salvar.");
            }
            setStatusMessage("Nao foi possivel salvar a empresa.");
          },
        }
      );
      return;
    }

    saveCompany.mutate(
      {
        companyId,
        payload: {
          tradeName,
          legalName: legalName || undefined,
          nicheIds: nicheSelection.length ? nicheSelection : undefined,
        },
      },
      {
        onSuccess: async () => {
          if (channelsPayload.hasAny) {
            try {
              await apiClient.patch(`/companies/${companyId}/channels`, channelsPayload.payload);
            } catch {
              setErrorDetails("Nao foi possivel atualizar os canais da empresa.");
            }
          }
          setStatusMessage("Empresa atualizada.");
          navigate("/companies");
        },
        onError: (error) => {
          if (axios.isAxiosError(error)) {
            const status = error.response?.status;
            const data = error.response?.data as
              | { message?: string; error?: string | { message?: string } }
              | undefined;
            const message =
              data?.message ??
              (typeof data?.error === "string" ? data.error : data?.error?.message);
            setErrorDetails(
              status
                ? `Erro ${status}${message ? `: ${message}` : ""}`
                : message ?? "Erro desconhecido ao atualizar."
            );
          } else {
            setErrorDetails("Erro desconhecido ao atualizar.");
          }
          setStatusMessage("Nao foi possivel atualizar a empresa.");
        },
      }
    );
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <h2 className="text-xl font-semibold text-slate-900">
        {isCreating ? "Nova empresa" : "Editar empresa"}
      </h2>
      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-700" htmlFor="tradeName">
          Nome fantasia
        </label>
        <Input
          id="tradeName"
          value={tradeName}
          onChange={(event) => setTradeNameOverride(event.target.value)}
          required
        />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-700" htmlFor="legalName">
          Razao social
        </label>
        <Input
          id="legalName"
          value={legalName}
          onChange={(event) => setLegalNameOverride(event.target.value)}
        />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-700" htmlFor="cityId">
          Cidade
        </label>
        <select
          id="cityId"
          className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
          value={cityInput}
          disabled={!isCreating || citiesQuery.isLoading}
          onChange={(event) => setCityIdOverride(event.target.value)}
          required={isCreating}
        >
          <option value="">{citiesQuery.isLoading ? "Carregando..." : "Selecione"}</option>
          {cityOptions.map((city) => (
            <option key={city.id} value={city.id}>
              {city.name} / {city.state}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="nicheSearch">
          Nichos
        </label>
        <Input
          id="nicheSearch"
          value={nicheSearch}
          onChange={(event) => setNicheSearch(event.target.value)}
          placeholder="Buscar nicho..."
        />
        {nicheSearch.trim().length >= 3 ? (
          <div className="max-h-48 space-y-2 overflow-auto rounded-md border border-slate-200 px-3 py-2 text-sm">
            {filteredNiches.length ? (
              filteredNiches.map((niche) => (
                <label key={niche.id} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={nicheSelection.includes(niche.id)}
                    onChange={(event) => {
                      const next = event.target.checked
                        ? [...nicheSelection, niche.id]
                        : nicheSelection.filter((id) => id !== niche.id);
                      setNicheSelectionOverride(next);
                    }}
                  />
                  <span>{niche.label}</span>
                </label>
              ))
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-slate-500">Nenhum nicho encontrado.</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCreateNiche}
                  disabled={!canCreateNiche}
                >
                  {isCreatingNiche ? "Adicionando..." : `Adicionar "${nicheSearch.trim()}"`}
                </Button>
                {createNicheError ? (
                  <p className="text-xs text-rose-600">{createNicheError}</p>
                ) : null}
              </div>
            )}
          </div>
        ) : null}
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-700" htmlFor="address">
          Endereco
        </label>
        <Input
          id="address"
          value={address}
          onChange={(event) => setAddressOverride(event.target.value)}
        />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-700" htmlFor="phone">
          Telefone
        </label>
        <Input
          id="phone"
          value={phone}
          onChange={(event) => setPhoneOverride(event.target.value)}
        />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-700" htmlFor="whatsapp">
          WhatsApp
        </label>
        <Input
          id="whatsapp"
          value={whatsapp}
          onChange={(event) => setWhatsappOverride(event.target.value)}
        />
        <p className="text-xs text-slate-500">
          Ativacao automatica com 70 pontos: Nome +20, Endereco +10, Cidade + nicho +20,
          Telefone +20, WhatsApp +30.
        </p>
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-700" htmlFor="openingHours">
          Horario
        </label>
        <Input
          id="openingHours"
          value={openingHours}
          onChange={(event) => setOpeningHoursOverride(event.target.value)}
        />
      </div>
      {statusMessage ? (
        <p className="text-sm text-slate-600">{statusMessage}</p>
      ) : null}
      {errorDetails ? (
        <p className="text-sm text-red-600">{errorDetails}</p>
      ) : null}
      {saveCompany.error ? (
        <p className="text-sm text-red-600">
          {(saveCompany.error as Error).message}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => navigate("/companies")}>
          Cancelar
        </Button>
        <Button type="submit" disabled={saveCompany.isPending}>
          {saveCompany.isPending ? "Salvando..." : "Salvar"}
        </Button>
      </div>
    </form>
  );
};
