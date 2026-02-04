import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/ToastProvider";
import {
  useSerpapiNicheCompaniesQuery,
  useSerpapiNicheReprocessMutation,
  useSerpapiNicheDeleteMutation,
  useSerpapiNicheCompanyDeleteMutation,
  useSerpapiNicheUpdateMutation,
} from "@/features/admin/serpapi/api";
import { SerpapiEditCompanyModal } from "@/features/admin/serpapi/SerpapiEditCompanyModal";

type Props = {
  open: boolean;
  nicheId: string | null;
  currentIndex: number;
  totalNiches: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
};

const IconPin = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4 text-slate-500" aria-hidden="true">
    <path
      fill="currentColor"
      d="M12 2a7 7 0 0 1 7 7c0 4.03-4.46 9.17-6.19 11.03a1.1 1.1 0 0 1-1.62 0C9.46 18.17 5 13.03 5 9a7 7 0 0 1 7-7Zm0 3a4 4 0 1 0 .01 8.01A4 4 0 0 0 12 5Z"
    />
  </svg>
);

const IconPhone = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4 text-slate-500" aria-hidden="true">
    <path
      fill="currentColor"
      d="M6.6 2h3.2c.5 0 .9.3 1 .8l.8 3.2a1 1 0 0 1-.3 1l-1.6 1.3c1 2.2 2.6 3.8 4.8 4.8l1.3-1.6a1 1 0 0 1 1-.3l3.2.8c.5.1.8.5.8 1v3.2c0 .6-.5 1-1 1C11 18 6 13 6 3c0-.6.4-1 1-1Z"
    />
  </svg>
);

const IconPencil = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
    <path
      fill="currentColor"
      d="m4 17.25 9.9-9.9 2.75 2.75-9.9 9.9H4v-2.75Zm14.85-9.1a.75.75 0 0 0 0-1.06l-1.94-1.94a.75.75 0 0 0-1.06 0l-1.4 1.4 3 3 1.4-1.4Z"
    />
  </svg>
);

const IconTrash = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
    <path
      fill="currentColor"
      d="M9 3h6l1 2h4v2H4V5h4l1-2Zm1 6h2v9h-2V9Zm4 0h2v9h-2V9Z"
    />
  </svg>
);

const getSourceBadge = (source?: string | null) => {
  const normalized = source?.toLowerCase();
  if (normalized === "serpapi") {
    return {
      label: "SerpAPI",
      className: "bg-sky-100 text-sky-700",
    };
  }
  if (normalized === "manual") {
    return {
      label: "Manual",
      className: "bg-slate-100 text-slate-700",
    };
  }
  return {
    label: "Outro",
    className: "bg-slate-100 text-slate-500",
  };
};

export const SerpapiNicheCompaniesModal = ({
  open,
  nicheId,
  currentIndex,
  totalNiches,
  onClose,
  onPrev,
  onNext,
}: Props) => {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const companiesQuery = useSerpapiNicheCompaniesQuery(nicheId, {
    enabled: open && Boolean(nicheId),
    staleTime: 0,
    refetchOnMount: true,
  });
  const reprocessMutation = useSerpapiNicheReprocessMutation();
  const deleteMutation = useSerpapiNicheDeleteMutation();
  const deleteCompanyMutation = useSerpapiNicheCompanyDeleteMutation();
  const updateNicheMutation = useSerpapiNicheUpdateMutation();
  const [editCompanyId, setEditCompanyId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isEditingNiche, setIsEditingNiche] = useState(false);
  const [nicheLabelInput, setNicheLabelInput] = useState("");
  const [nicheLabelError, setNicheLabelError] = useState("");

  useEffect(() => {
    if (open) {
      closeRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  const nicheName = companiesQuery.data?.niche.name ?? "--";
  const companies = companiesQuery.data?.companies ?? [];

  useEffect(() => {
    if (!isEditingNiche) {
      setNicheLabelInput(nicheName === "--" ? "" : nicheName);
    }
  }, [nicheName, isEditingNiche]);
  const filteredCompanies = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return companies;
    return companies.filter((company) => {
      const values = [
        company.name,
        company.address,
        company.phone,
        company.whatsapp,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return values.includes(term);
    });
  }, [companies, searchTerm]);
  const totalCompanies = companies.length;
  const canNavigate = totalNiches > 0 && currentIndex > 0;
  const canPrev = canNavigate && currentIndex > 1;
  const canNext = canNavigate && currentIndex < totalNiches;

  const subLine = useMemo(() => {
    if (!canNavigate) {
      return `${totalCompanies} empresas encontradas`;
    }
    return `${totalCompanies} empresas encontradas • ${currentIndex} de ${totalNiches} nichos`;
  }, [canNavigate, currentIndex, totalCompanies, totalNiches]);

  const handleReprocess = async () => {
    if (!nicheId) return;
    try {
      await reprocessMutation.mutateAsync({ nicheId });
      queryClient.invalidateQueries({ queryKey: ["serpapi", "niches", nicheId, "companies"] });
      queryClient.invalidateQueries({ queryKey: ["serpapi", "niches"] });
      pushToast({
        type: "success",
        title: "Reprocessamento iniciado",
        message: `Nicho ${nicheName}`,
      });
    } catch {
      pushToast({
        type: "error",
        title: "Erro ao reprocessar",
        message: "Tente novamente.",
      });
    }
  };

  const handleDeleteNiche = async () => {
    if (!nicheId) return;
    const confirmed = window.confirm(
      "Deseja apagar este nicho? Os vinculos e dados associados serao removidos. Esta acao nao pode ser desfeita."
    );
    if (!confirmed) return;
    try {
      await deleteMutation.mutateAsync({ nicheId });
      queryClient.invalidateQueries({ queryKey: ["serpapi", "niches"] });
      queryClient.invalidateQueries({ queryKey: ["serpapi", "niches", nicheId, "companies"] });
      queryClient.invalidateQueries({ queryKey: ["serpapi", "metrics"] });
      pushToast({
        type: "success",
        title: "Nicho apagado",
        message: "O nicho foi removido com sucesso.",
      });
      onClose();
    } catch {
      pushToast({
        type: "error",
        title: "Erro ao apagar",
        message: "Nao foi possivel remover o nicho.",
      });
    }
  };

  const handleStartEditNiche = () => {
    setIsEditingNiche(true);
    setNicheLabelError("");
    if (nicheName && nicheName !== "--") {
      setNicheLabelInput(nicheName);
    }
  };

  const handleCancelEditNiche = () => {
    setIsEditingNiche(false);
    setNicheLabelError("");
    setNicheLabelInput(nicheName === "--" ? "" : nicheName);
  };

  const handleSaveNiche = async () => {
    if (!nicheId) return;
    const trimmed = nicheLabelInput.trim();
    if (!trimmed) {
      setNicheLabelError("Informe o nome do nicho.");
      return;
    }
    setNicheLabelError("");
    try {
      await updateNicheMutation.mutateAsync({ nicheId, label: trimmed });
      queryClient.invalidateQueries({ queryKey: ["serpapi", "niches"] });
      queryClient.invalidateQueries({ queryKey: ["serpapi", "niches", nicheId, "companies"] });
      pushToast({
        type: "success",
        title: "Nicho atualizado",
        message: "O nome foi alterado com sucesso.",
      });
      setIsEditingNiche(false);
    } catch {
      setNicheLabelError("Nao foi possivel atualizar o nicho.");
    }
  };

  const handleDeleteCompany = async (companyId: string) => {
    if (!nicheId) return;
    const confirmed = window.confirm("Deseja remover esta empresa deste nicho?");
    if (!confirmed) return;
    try {
      await deleteCompanyMutation.mutateAsync({ nicheId, companyId });
      queryClient.invalidateQueries({ queryKey: ["serpapi", "niches", nicheId, "companies"] });
      queryClient.invalidateQueries({ queryKey: ["serpapi", "niches"] });
      pushToast({
        type: "success",
        title: "Empresa removida",
        message: "A relacao do nicho foi atualizada.",
      });
    } catch {
      pushToast({
        type: "error",
        title: "Erro ao remover empresa",
        message: "Tente novamente.",
      });
    }
  };

  const handleOpenEdit = (companyId: string) => {
    setEditCompanyId(companyId);
  };

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex w-full max-w-3xl max-h-[75vh] flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-6 py-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Empresas do Nicho: {nicheName}
            </h2>
            <p className="text-xs text-slate-500">{subLine}</p>
            {isEditingNiche ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Input
                  value={nicheLabelInput}
                  onChange={(event) => setNicheLabelInput(event.target.value)}
                  placeholder="Nome do nicho"
                  className="w-64"
                />
              </div>
            ) : null}
            {nicheLabelError ? (
              <p className="mt-1 text-xs text-rose-600">{nicheLabelError}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="ghost" onClick={onPrev} disabled={!canPrev}>
              {"<"}
            </Button>
            <Button size="sm" variant="ghost" onClick={onNext} disabled={!canNext}>
              {">"}
            </Button>
            {isEditingNiche ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSaveNiche}
                  disabled={updateNicheMutation.isPending}
                >
                  {updateNicheMutation.isPending ? "Salvando..." : "Salvar nicho"}
                </Button>
                <Button size="sm" variant="ghost" onClick={handleCancelEditNiche}>
                  Cancelar
                </Button>
              </>
            ) : (
              <Button size="sm" variant="outline" onClick={handleStartEditNiche}>
                Editar nicho
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={handleReprocess}
              disabled={reprocessMutation.isPending}
            >
              {reprocessMutation.isPending ? "Reprocessando..." : "Reprocessar"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-rose-200 text-rose-600 hover:bg-rose-50"
              onClick={handleDeleteNiche}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Apagando..." : "Apagar"}
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose} ref={closeRef}>
              X
            </Button>
          </div>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-auto px-6 py-5">
          {companiesQuery.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="h-24 rounded-2xl border border-slate-200 bg-slate-50 animate-pulse"
                />
              ))}
            </div>
          ) : companiesQuery.isError ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
              Nao foi possivel carregar as empresas.
              <Button
                size="sm"
                variant="outline"
                className="ml-3"
                onClick={() => companiesQuery.refetch()}
              >
                Tentar novamente
              </Button>
            </div>
          ) : companies.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
              Ainda nao coletamos empresas para este nicho.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <Input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Buscar empresa..."
                />
                <span className="text-xs text-slate-500">
                  {filteredCompanies.length} de {companies.length}
                </span>
              </div>
              {filteredCompanies.map((company) => {
                const sourceBadge = getSourceBadge(company.source);
                return (
                  <div
                    key={company.id}
                    className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm cursor-pointer"
                    onClick={() => handleOpenEdit(company.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        handleOpenEdit(company.id);
                      }
                    }}
                  >
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-slate-900">{company.name}</p>
                      <div className="flex items-start gap-2 text-xs text-slate-600">
                        <IconPin />
                        <span>{company.address || "--"}</span>
                      </div>
                      <div className="flex items-start gap-2 text-xs text-slate-600">
                        <IconPhone />
                        <span>{company.phone || "--"}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-3">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <span
                          className={`rounded-full px-2 py-1 text-[10px] font-semibold ${sourceBadge.className}`}
                        >
                          {sourceBadge.label}
                        </span>
                        <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold text-amber-700">
                          API
                        </span>
                        {company.hasWhatsapp ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold text-emerald-700">
                            WhatsApp
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleOpenEdit(company.id);
                          }}
                          aria-label="Editar empresa"
                        >
                          <IconPencil />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleDeleteCompany(company.id);
                          }}
                          aria-label="Remover empresa do nicho"
                          disabled={deleteCompanyMutation.isPending}
                          className="text-rose-600 hover:bg-rose-50"
                        >
                          <IconTrash />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <SerpapiEditCompanyModal
        open={Boolean(editCompanyId)}
        nicheId={nicheId}
        companyId={editCompanyId}
        onClose={() => setEditCompanyId(null)}
      />
    </div>
  );
};
