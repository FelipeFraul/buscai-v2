import { useMemo, useState } from "react";
import type { AxiosError } from "axios";

import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/ToastProvider";
import type {
  PublishSerpapiRecordPayload,
  PublishSerpapiRecordResponse,
  SerpapiDedupeHit,
  SerpapiRecordItem,
} from "@/features/admin/serpapi/api";

type Props = {
  open: boolean;
  runId: string | null;
  record: SerpapiRecordItem | null;
  onClose: () => void;
  onPublish: (payload: PublishSerpapiRecordPayload) => Promise<PublishSerpapiRecordResponse>;
};

const parsePreview = (preview?: string | null) => {
  if (!preview) {
    return { title: "-", name: "-", address: "-", website: "-" };
  }
  try {
    const parsed = JSON.parse(preview) as Record<string, string>;
    return {
      title: parsed.title ?? "-",
      name: parsed.name ?? "-",
      address: parsed.address ?? "-",
      website: parsed.website ?? "-",
    };
  } catch {
    return { title: "-", name: "-", address: "-", website: "-" };
  }
};

export const SerpapiPublishRecordModal = ({ open, runId, record, onClose, onPublish }: Props) => {
  const [statusAfter, setStatusAfter] = useState<"pending" | "active">("pending");
  const [dedupeHits, setDedupeHits] = useState<SerpapiDedupeHit[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { pushToast } = useToast();

  const preview = useMemo(() => parsePreview(record?.rawPreview ?? null), [record?.rawPreview]);

  if (!open || !record || !runId) {
    return null;
  }

  const handlePublish = async (force = false) => {
    setSubmitting(true);
    setError(null);
    try {
      const response = await onPublish({
        runId,
        recordId: record.id,
        statusAfter,
        force,
      });
      const shortRecordId = record.id.slice(0, 8);
      const shortCompanyId = response.companyId.slice(0, 8);
      pushToast({
        type: "success",
        title: "Company criada",
        message: `mode=${response.mode} record=${shortRecordId} company=${shortCompanyId}`,
      });
      setDedupeHits(null);
      onClose();
    } catch (err) {
      const axiosError = err as AxiosError | undefined;
      const response = axiosError?.response;
      const requestId = response?.headers?.["x-request-id"];
      if (response?.status === 409 && (response.data as any)?.dedupeHits) {
        setDedupeHits((response.data as { dedupeHits: SerpapiDedupeHit[] }).dedupeHits ?? []);
        pushToast({
          type: "error",
          title: "Duplicata encontrada",
          message: "Revise as empresas sugeridas ou force a criacao.",
        });
        setSubmitting(false);
        return;
      }
      if (requestId) {
        console.warn("publish-record failed", { requestId });
      }
      pushToast({
        type: "error",
        title: "Erro ao criar company",
        message: requestId ? `request-id=${requestId}` : "Tente novamente.",
      });
      setError("Nao foi possivel criar a company.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Publicar company</h2>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Fechar
          </Button>
        </div>

        <div className="mt-4 space-y-2 text-sm text-slate-600">
          <div className="text-xs uppercase text-slate-400">Record</div>
          <div className="font-mono text-xs">{record.id}</div>
          <div className="grid gap-2 md:grid-cols-2">
            <div>
              <span className="text-xs uppercase text-slate-400">Titulo/Nome</span>
              <div>{preview.title !== "-" ? preview.title : preview.name}</div>
            </div>
            <div>
              <span className="text-xs uppercase text-slate-400">Website</span>
              <div>{preview.website ?? "-"}</div>
            </div>
            <div className="md:col-span-2">
              <span className="text-xs uppercase text-slate-400">Endereco</span>
              <div>{preview.address ?? "-"}</div>
            </div>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <div className="text-sm font-semibold text-slate-700">Status inicial</div>
          <div className="flex gap-2">
            <button
              type="button"
              className={`rounded-md border px-3 py-2 text-sm ${
                statusAfter === "pending" ? "border-amber-400 bg-amber-50" : "border-slate-200"
              }`}
              onClick={() => setStatusAfter("pending")}
              disabled={submitting}
            >
              Pending
            </button>
            <button
              type="button"
              className={`rounded-md border px-3 py-2 text-sm ${
                statusAfter === "active" ? "border-amber-400 bg-amber-50" : "border-slate-200"
              }`}
              onClick={() => setStatusAfter("active")}
              disabled={submitting}
            >
              Active
            </button>
          </div>

          {dedupeHits?.length ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-semibold">Duplicatas detectadas</p>
              <ul className="mt-2 space-y-1">
                {dedupeHits.map((hit) => (
                  <li key={hit.id} className="text-xs">
                    {hit.name} • {hit.id.slice(0, 8)} • {hit.phoneE164 ?? hit.whatsappE164 ?? "-"}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={submitting}>
              Cancelar
            </Button>
            {dedupeHits?.length ? (
              <Button onClick={() => handlePublish(true)} disabled={submitting}>
                {submitting ? "Salvando..." : "Forcar criacao"}
              </Button>
            ) : (
              <Button onClick={() => handlePublish(false)} disabled={submitting}>
                {submitting ? "Salvando..." : "Criar company"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
