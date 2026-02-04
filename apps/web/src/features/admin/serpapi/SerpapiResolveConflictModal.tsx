import { useMemo, useState } from "react";
import type { AxiosError } from "axios";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/ToastProvider";
import type { SerpapiRecordItem } from "@/features/admin/serpapi/api";

type ActionType = "link_existing" | "create_new" | "ignore";

type Props = {
  open: boolean;
  record: SerpapiRecordItem | null;
  runId: string | null;
  onClose: () => void;
  onResolve: (payload: { runId: string; recordId: string; action: ActionType; companyId?: string }) => Promise<void>;
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

export const SerpapiResolveConflictModal = ({ open, record, runId, onClose, onResolve }: Props) => {
  const [action, setAction] = useState<ActionType>("ignore");
  const [companyId, setCompanyId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { pushToast } = useToast();

  const preview = useMemo(() => parsePreview(record?.rawPreview ?? null), [record?.rawPreview]);

  if (!open || !record || !runId) {
    return null;
  }

  const requiresCompany = action === "link_existing" || action === "create_new";
  const resolvedCompanyId = companyId.trim();
  const canSubmit = !submitting && (!requiresCompany || Boolean(resolvedCompanyId));
  const actionLabel =
    action === "link_existing" ? "merge" : action === "create_new" ? "substituir" : "ignorar";

  const handleSubmit = async () => {
    if (requiresCompany && !resolvedCompanyId) {
      setError("Informe o Company ID para esta ação.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onResolve({
        runId,
        recordId: record.id,
        action,
        companyId: requiresCompany ? resolvedCompanyId : undefined,
      });
      const shortRecordId = record.id.slice(0, 8);
      const shortRunId = runId.slice(0, 8);
      pushToast({
        type: "success",
        title: "Conflito resolvido",
        message: `acao=${actionLabel} record=${shortRecordId} run=${shortRunId}`,
      });
      setCompanyId("");
      setAction("ignore");
      onClose();
    } catch (err) {
      const axiosError = err as AxiosError | undefined;
      const requestId = axiosError?.response?.headers?.["x-request-id"];
      if (requestId) {
        console.warn("resolve-conflict failed", { requestId });
      }
      pushToast({
        type: "error",
        title: "Erro ao resolver conflito",
        message: requestId ? `request-id=${requestId}` : "Tente novamente.",
      });
      setError("Nao foi possivel resolver o conflito.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Resolver conflito</h2>
          <Button variant="ghost" onClick={onClose}>
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
            <div>
              <span className="text-xs uppercase text-slate-400">Telefone</span>
              <div>—</div>
            </div>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          <div className="text-sm font-semibold text-slate-700">Acao</div>
          <div className="grid gap-2 sm:grid-cols-3">
            <button
              type="button"
              className={`rounded-md border px-3 py-2 text-sm ${
                action === "link_existing" ? "border-amber-400 bg-amber-50" : "border-slate-200"
              }`}
              onClick={() => setAction("link_existing")}
              disabled={submitting}
            >
              Merge
            </button>
            <button
              type="button"
              className={`rounded-md border px-3 py-2 text-sm ${
                action === "create_new" ? "border-amber-400 bg-amber-50" : "border-slate-200"
              }`}
              onClick={() => setAction("create_new")}
              disabled={submitting}
            >
              Substituir
            </button>
            <button
              type="button"
              className={`rounded-md border px-3 py-2 text-sm ${
                action === "ignore" ? "border-amber-400 bg-amber-50" : "border-slate-200"
              }`}
              onClick={() => setAction("ignore")}
              disabled={submitting}
            >
              Ignorar
            </button>
          </div>

          {requiresCompany && (
            <div className="space-y-1">
              <label className="text-xs uppercase text-slate-400">Company ID</label>
              <Input
                value={companyId}
                onChange={(event) => setCompanyId(event.target.value)}
                placeholder="UUID da empresa"
                disabled={submitting}
              />
              <p className="text-xs text-slate-400">Obrigatorio para Merge/Substituir.</p>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={submitting}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={!canSubmit}>
              {submitting ? "Salvando..." : "Confirmar"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
