import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/ToastProvider";
import { useSerpapiCompanyQuery, useUpdateSerpapiCompanyMutation } from "@/features/admin/serpapi/api";

type Props = {
  open: boolean;
  nicheId: string | null;
  companyId: string | null;
  onClose: () => void;
};

type FormState = {
  name: string;
  address: string;
  phone: string;
  whatsapp: string;
  participatesInAuction: boolean;
  hasWhatsapp: boolean;
};

const emptyForm: FormState = {
  name: "",
  address: "",
  phone: "",
  whatsapp: "",
  participatesInAuction: false,
  hasWhatsapp: false,
};

const getSourceBadge = (source?: string | null) => {
  const normalized = source?.toLowerCase();
  if (normalized === "serpapi") {
    return { label: "SerpAPI", className: "bg-sky-100 text-sky-700" };
  }
  if (normalized === "manual") {
    return { label: "Manual", className: "bg-slate-100 text-slate-700" };
  }
  return { label: "Outro", className: "bg-slate-100 text-slate-500" };
};

export const SerpapiEditCompanyModal = ({ open, nicheId, companyId, onClose }: Props) => {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const companyQuery = useSerpapiCompanyQuery(companyId, { enabled: open && Boolean(companyId) });
  const updateMutation = useUpdateSerpapiCompanyMutation();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setForm(emptyForm);
      setError(null);
      return;
    }
    closeRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (companyQuery.data) {
      setForm({
        name: companyQuery.data.name ?? "",
        address: companyQuery.data.address ?? "",
        phone: companyQuery.data.phone ?? "",
        whatsapp: companyQuery.data.whatsapp ?? "",
        participatesInAuction: companyQuery.data.participatesInAuction ?? false,
        hasWhatsapp: companyQuery.data.hasWhatsapp ?? Boolean(companyQuery.data.whatsapp),
      });
    }
  }, [companyQuery.data]);

  const isNameValid = Boolean(form.name.trim());
  const whatsappRequired = form.hasWhatsapp && !form.whatsapp.trim();
  const canSave = isNameValid && !whatsappRequired && !updateMutation.isPending;

  const helper = useMemo(() => {
    if (!isNameValid) return "Nome da empresa e obrigatorio.";
    if (whatsappRequired) return "Informe um WhatsApp valido para ativar o switch.";
    return null;
  }, [isNameValid, whatsappRequired]);

  const handleSave = async () => {
    if (!companyId || !canSave) return;
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        address: form.address.trim(),
        phone: form.phone.trim() || null,
        whatsapp: form.whatsapp.trim() || null,
        participatesInAuction: form.participatesInAuction,
        hasWhatsapp: form.hasWhatsapp,
      };
      const updated = await updateMutation.mutateAsync({ companyId, payload });
      if (nicheId) {
        queryClient.setQueryData(
          ["serpapi", "niches", nicheId, "companies"],
          (prev: unknown) => {
            if (!prev || typeof prev !== "object") return prev;
            const current = prev as { niche: { id: string; name: string }; companies: any[] };
            return {
              ...current,
              companies: current.companies.map((company) =>
                company.id === companyId
                  ? {
                      ...company,
                      name: updated.name ?? company.name,
                      address: updated.addressLine ?? company.address,
                      phone: updated.phoneE164 ?? company.phone,
                      whatsapp: updated.whatsappE164 ?? company.whatsapp,
                      hasWhatsapp: updated.hasWhatsapp ?? company.hasWhatsapp,
                    }
                  : company
              ),
            };
          }
        );
        queryClient.invalidateQueries({ queryKey: ["serpapi", "niches", nicheId, "companies"] });
        queryClient.invalidateQueries({ queryKey: ["serpapi", "niches"] });
      }
      pushToast({ type: "success", title: "Empresa atualizada" });
      onClose();
    } catch {
      setError("Nao foi possivel salvar a empresa.");
      pushToast({ type: "error", title: "Erro ao salvar", message: "Tente novamente." });
    }
  };

  if (!open) {
    return null;
  }

  const sourceBadge = getSourceBadge(companyQuery.data?.origin);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" data-testid="serpapi-edit-company-modal">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-8 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Editar Empresa</h2>
            <p className="text-sm text-slate-500">
              Atualize as informacoes da empresa no sistema BUSCAI
            </p>
            {companyQuery.data?.origin ? (
              <span
                className={`mt-2 inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${sourceBadge.className}`}
              >
                {sourceBadge.label}
              </span>
            ) : null}
          </div>
          <Button variant="ghost" onClick={onClose} ref={closeRef}>
            X
          </Button>
        </div>

        {companyQuery.isLoading ? (
          <div className="mt-6 space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-10 rounded-xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <label className="text-sm text-slate-700">
              Nome da Empresa
              <Input
                className="mt-1"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Nome da empresa"
              />
            </label>
            <label className="text-sm text-slate-700">
              Endereco
              <textarea
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-slate-300 focus:outline-none"
                rows={3}
                value={form.address}
                onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))}
              />
            </label>
            <label className="text-sm text-slate-700">
              Telefone
              <Input
                className="mt-1"
                value={form.phone}
                onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                placeholder="(00) 0000-0000"
              />
            </label>
            <label className="text-sm text-slate-700">
              WhatsApp
              <Input
                className="mt-1"
                value={form.whatsapp}
                onChange={(event) => setForm((prev) => ({ ...prev, whatsapp: event.target.value }))}
                placeholder="(00) 00000-0000"
              />
            </label>

            <div className="space-y-2 pt-2">
              <label className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700">
                <span>Participa do Leilao</span>
                <input
                  type="checkbox"
                  checked={form.participatesInAuction}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, participatesInAuction: event.target.checked }))
                  }
                />
              </label>
              <label className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700">
                <span>Tem WhatsApp</span>
                <input
                  type="checkbox"
                  checked={form.hasWhatsapp}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, hasWhatsapp: event.target.checked }))
                  }
                />
              </label>
            </div>

            {helper ? <p className="text-xs text-rose-600">{helper}</p> : null}
            {error ? <p className="text-xs text-rose-600">{error}</p> : null}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={onClose} disabled={updateMutation.isPending}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={!canSave}>
                {updateMutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
