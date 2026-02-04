import { useMemo, useState } from "react";
import type { AxiosError } from "axios";
import { useNavigate, Link } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/ToastProvider";
import { AdminCompanyForm } from "@/features/admin/companies/AdminCompanyForm";
import { AdminCompanyDedupeModal } from "@/features/admin/companies/AdminCompanyDedupeModal";
import { useCreateAdminCompany } from "@/features/admin/companies/api";

type AdminCompanyFormState = Parameters<typeof AdminCompanyForm>[0]["value"];

const createEmptyForm = (): AdminCompanyFormState => ({
  name: "",
  cityId: "",
  nicheId: "",
  addressLine: "",
  phoneE164: "",
  whatsappE164: "",
  website: "",
  lat: "",
  lng: "",
  origin: "manual",
  qualityScore: "",
  status: "pending",
});

export const AdminCompanyNewPage = () => {
  const [form, setForm] = useState<AdminCompanyFormState>(createEmptyForm());
  const mutation = useCreateAdminCompany();
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const [dedupeHits, setDedupeHits] = useState<
    { id: string; name: string; addressLine: string | null; phoneE164: string | null; whatsappE164: string | null; website: string | null }[] | null
  >(null);
  const [pendingPayload, setPendingPayload] = useState<{
    name: string;
    cityId: string;
    nicheId: string;
    addressLine: string;
    phoneE164?: string;
    whatsappE164?: string;
    website?: string;
    lat?: number;
    lng?: number;
    origin?: "manual" | "serpapi" | "claimed";
    status?: "draft" | "pending" | "active" | "suspended";
  } | null>(null);

  const canSubmit = useMemo(
    () =>
      Boolean(form.name.trim()) &&
      Boolean(form.cityId) &&
      Boolean(form.nicheId) &&
      Boolean(form.addressLine.trim()),
    [form]
  );

  const handleSubmit = async () => {
    if (!canSubmit) return;
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
        status: form.status,
      };
      setPendingPayload(payload);
      const created = await mutation.mutateAsync(payload);
      pushToast({ type: "success", title: "Empresa criada", message: created.id.slice(0, 8) });
      navigate(`/admin/companies/${created.id}`);
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
      pushToast({ type: "error", title: "Erro ao criar empresa", message });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Nova empresa</h1>
            <p className="text-sm text-slate-500">Criar empresa manualmente no catalogo.</p>
          </div>
          <Button asChild variant="outline">
            <Link to="/admin/companies">Voltar</Link>
          </Button>
        </div>
        <AdminCompanyForm
          value={form}
          onChange={setForm}
          onSubmit={handleSubmit}
          submitLabel="Criar"
          loading={mutation.isPending}
          showStatus
        />
        <AdminCompanyDedupeModal
          open={Boolean(dedupeHits?.length)}
          hits={dedupeHits ?? []}
          onClose={() => setDedupeHits(null)}
          onForce={async () => {
            if (!pendingPayload) return;
            try {
              const created = await mutation.mutateAsync({ ...pendingPayload, force: true });
              pushToast({ type: "success", title: "Empresa criada", message: created.id.slice(0, 8) });
              setDedupeHits(null);
              navigate(`/admin/companies/${created.id}`);
            } catch {
              pushToast({ type: "error", title: "Erro ao forcar criacao", message: "Tente novamente." });
            }
          }}
        />
      </div>
    </div>
  );
};
