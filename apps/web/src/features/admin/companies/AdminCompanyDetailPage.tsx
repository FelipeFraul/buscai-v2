import { useEffect, useMemo, useState } from "react";
import type { AxiosError } from "axios";
import { Link, useParams } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/ToastProvider";
import { AdminCompanyForm } from "@/features/admin/companies/AdminCompanyForm";
import { AdminCompanyDedupeModal } from "@/features/admin/companies/AdminCompanyDedupeModal";
import {
  useAdminCompany,
  useSetAdminCompanyStatus,
  useUpdateAdminCompany,
} from "@/features/admin/companies/api";

type AdminCompanyFormState = Parameters<typeof AdminCompanyForm>[0]["value"];

const toFormState = (data: any): AdminCompanyFormState => ({
  name: data?.name ?? "",
  cityId: data?.cityId ?? "",
  nicheId: data?.nicheId ?? "",
  addressLine: data?.addressLine ?? "",
  phoneE164: data?.phoneE164 ?? "",
  whatsappE164: data?.whatsappE164 ?? "",
  website: data?.website ?? "",
  lat: data?.lat ?? "",
  lng: data?.lng ?? "",
  origin: data?.origin ?? "manual",
  qualityScore: String(data?.qualityScore ?? 50),
  status: data?.status ?? "pending",
});

export const AdminCompanyDetailPage = () => {
  const { companyId } = useParams();
  const { pushToast } = useToast();
  const companyQuery = useAdminCompany(companyId ?? null);
  const updateMutation = useUpdateAdminCompany();
  const statusMutation = useSetAdminCompanyStatus();
  const [form, setForm] = useState<AdminCompanyFormState>(toFormState(null));
  const [status, setStatus] = useState<AdminCompanyFormState["status"]>("pending");
  const [dedupeHits, setDedupeHits] = useState<
    { id: string; name: string; addressLine: string | null; phoneE164: string | null; whatsappE164: string | null; website: string | null }[] | null
  >(null);
  const [pendingPayload, setPendingPayload] = useState<{
    name?: string;
    cityId?: string;
    nicheId?: string;
    addressLine?: string;
    phoneE164?: string;
    whatsappE164?: string;
    website?: string;
    lat?: number;
    lng?: number;
    origin?: "manual" | "serpapi" | "claimed";
  } | null>(null);

  useEffect(() => {
    if (companyQuery.data) {
      setForm(toFormState(companyQuery.data));
      setStatus(companyQuery.data.status);
    }
  }, [companyQuery.data]);

  const canSubmit = useMemo(
    () =>
      Boolean(form.name.trim()) &&
      Boolean(form.cityId) &&
      Boolean(form.nicheId) &&
      Boolean(form.addressLine.trim()),
    [form]
  );

  const handleSave = async () => {
    if (!companyId || !canSubmit) return;
    try {
      const payload = {
        name: form.name,
        cityId: form.cityId,
        nicheId: form.nicheId,
        addressLine: form.addressLine,
        phoneE164: form.phoneE164 || undefined,
        whatsappE164: form.whatsappE164 || undefined,
        website: form.website || undefined,
        lat: form.lat ? Number(form.lat) : undefined,
        lng: form.lng ? Number(form.lng) : undefined,
        origin: form.origin,
      };
      setPendingPayload(payload);
      await updateMutation.mutateAsync({
        companyId,
        payload,
      });
      pushToast({ type: "success", title: "Empresa atualizada" });
      companyQuery.refetch();
    } catch (err) {
      const axiosError = err as AxiosError | undefined;
      const response = axiosError?.response;
      if (response?.status === 409 && (response.data as any)?.dedupeHits) {
        setDedupeHits((response.data as any).dedupeHits ?? []);
        return;
      }
      const message =
        (response?.data as any)?.error?.message ??
        (response?.data as any)?.message ??
        "Tente novamente.";
      pushToast({ type: "error", title: "Erro ao salvar", message });
    }
  };

  const handleStatus = async () => {
    if (!companyId) return;
    try {
      await statusMutation.mutateAsync({ companyId, status });
      pushToast({ type: "success", title: "Status atualizado" });
      companyQuery.refetch();
    } catch (err) {
      const axiosError = err as AxiosError | undefined;
      const response = axiosError?.response;
      const message =
        (response?.data as any)?.error?.message ??
        (response?.data as any)?.message ??
        "Tente novamente.";
      pushToast({ type: "error", title: "Erro ao atualizar status", message });
    }
  };

  if (companyQuery.isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-4xl rounded-2xl bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">Carregando empresa...</p>
        </div>
      </div>
    );
  }

  if (companyQuery.isError || !companyQuery.data) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-4xl rounded-2xl bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">Nao foi possivel carregar a empresa.</p>
          <Button variant="outline" className="mt-3" onClick={() => companyQuery.refetch()}>
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Empresa</h1>
            <p className="text-sm text-slate-500">{companyId}</p>
          </div>
          <Button asChild variant="outline">
            <Link to="/admin/companies">Voltar</Link>
          </Button>
        </div>

        <AdminCompanyForm
          value={form}
          onChange={setForm}
          onSubmit={handleSave}
          submitLabel="Salvar"
          loading={updateMutation.isPending}
          showStatus={false}
        />
        <AdminCompanyDedupeModal
          open={Boolean(dedupeHits?.length)}
          hits={dedupeHits ?? []}
          onClose={() => setDedupeHits(null)}
          onForce={async () => {
            if (!companyId || !pendingPayload) return;
            try {
              await updateMutation.mutateAsync({
                companyId,
                payload: { ...pendingPayload, force: true },
              });
              pushToast({ type: "success", title: "Empresa atualizada" });
              setDedupeHits(null);
              companyQuery.refetch();
            } catch {
              pushToast({ type: "error", title: "Erro ao forcar salvamento" });
            }
          }}
        />

        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm text-slate-600">
              Status
              <select
                className="ml-2 rounded-md border border-slate-200 px-2 py-1 text-sm"
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as AdminCompanyFormState["status"])
                }
              >
                <option value="draft">Draft</option>
                <option value="pending">Pending</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </select>
            </label>
            <Button onClick={handleStatus} disabled={statusMutation.isPending}>
              {statusMutation.isPending ? "Atualizando..." : "Salvar status"}
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
};
