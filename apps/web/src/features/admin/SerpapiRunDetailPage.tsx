import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { SerpapiRecordItem } from "@/features/admin/serpapi/api";
import {
  usePublishSerpapiRecordToCompany,
  useRunQuery,
  useRunRecordsQuery,
  useResolveSerpapiConflict,
} from "@/features/admin/serpapi/api";
import { SerpapiPublishRecordModal } from "@/features/admin/serpapi/SerpapiPublishRecordModal";
import { SerpapiResolveConflictModal } from "@/features/admin/serpapi/SerpapiResolveConflictModal";

const STATUS_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "inserted", label: "Inserido" },
  { value: "updated", label: "Atualizado" },
  { value: "conflict", label: "Conflito" },
  { value: "error", label: "Erro" },
  { value: "ignored", label: "Ignorado" },
] as const;

const pageSizeOptions = [10, 25, 50] as const;

const formatDate = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
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

const recordTitle = (record: SerpapiRecordItem) => {
  const preview = parsePreview(record.rawPreview);
  return preview.title !== "-" ? preview.title : preview.name;
};

export const SerpapiRunDetailPage = () => {
  const { runId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const resolveMutation = useResolveSerpapiConflict();
  const publishMutation = usePublishSerpapiRecordToCompany();
  const [selectedRecord, setSelectedRecord] = useState<SerpapiRecordItem | null>(null);
  const [publishRecord, setPublishRecord] = useState<SerpapiRecordItem | null>(null);

  const statusParam = searchParams.get("status") ?? "all";
  const status = statusParam === "all" ? undefined : statusParam;
  const focusRecordId = searchParams.get("focusRecordId") ?? "";
  const page = Math.max(Number(searchParams.get("page") ?? 1), 1);
  const rawPageSize = Number(searchParams.get("pageSize") ?? 10);
  const pageSize = pageSizeOptions.includes(rawPageSize as (typeof pageSizeOptions)[number])
    ? rawPageSize
    : 10;
  const search = searchParams.get("q") ?? "";
  const offset = (page - 1) * pageSize;

  const runQuery = useRunQuery(runId ?? null);
  const recordsQuery = useRunRecordsQuery(runId ?? null, { status, limit: pageSize, offset });

  const run = runQuery.data?.run;
  const records = recordsQuery.data?.items ?? [];
  const total = recordsQuery.data?.total ?? 0;

  const filteredRecords = useMemo(() => {
    if (!search.trim()) return records;
    const term = search.toLowerCase();
    return records.filter((record) => {
      const preview = parsePreview(record.rawPreview);
      return (
        preview.title.toLowerCase().includes(term) ||
        preview.name.toLowerCase().includes(term) ||
        preview.address.toLowerCase().includes(term) ||
        preview.website.toLowerCase().includes(term)
      );
    });
  }, [records, search]);

  useEffect(() => {
    if (!focusRecordId) return;
    const target = document.getElementById(`record-${focusRecordId}`);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [focusRecordId, filteredRecords.length]);

  const handleParamChange = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (!value || value === "all") {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    if (key !== "page") {
      next.set("page", "1");
    }
    setSearchParams(next);
  };

  const handlePageChange = (nextPage: number) => {
    const next = new URLSearchParams(searchParams);
    next.set("page", String(nextPage));
    setSearchParams(next);
  };

  const totalPages = Math.max(Math.ceil(total / pageSize), 1);
  const runIdValue = runId ?? null;

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">Detalhes da execucao</h1>
            <p className="text-sm text-slate-500">Run ID: {runId}</p>
          </div>
          <Button asChild variant="outline">
            <Link to="/admin/serpapi">Voltar</Link>
          </Button>
        </div>

        {runQuery.isLoading ? (
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <p className="text-sm text-slate-500">Carregando dados da execucao...</p>
          </div>
        ) : runQuery.isError ? (
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <p className="text-sm text-slate-500">Nao foi possivel carregar os detalhes.</p>
            <Button variant="outline" className="mt-3" onClick={() => runQuery.refetch()}>
              Tentar novamente
            </Button>
          </div>
        ) : (
          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-xs uppercase text-slate-500">Status</p>
                <p className="text-lg font-semibold">{run?.status ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500">Criado em</p>
                <p className="text-sm">{formatDate(run?.createdAt ?? null)}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500">Finalizado em</p>
                <p className="text-sm">{formatDate(run?.finishedAt ?? null)}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500">Iniciado por</p>
                <p className="text-sm">{run?.initiatedByUserId ?? "--"}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500">Dry run</p>
                <p className="text-sm">{run?.dryRun ? "Sim" : "Nao"}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500">Deduplicadas</p>
                <p className="text-sm">{run?.deduped?.toLocaleString("pt-BR") ?? "--"}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500">Cidade</p>
                <p className="text-sm">{run?.cityId ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500">Nicho</p>
                <p className="text-sm">{run?.nicheId ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500">Query</p>
                <p className="text-sm">{run?.query ?? "—"}</p>
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs uppercase text-slate-500">Parametros usados</p>
              <pre className="mt-2 whitespace-pre-wrap text-xs text-slate-700">
                {run?.paramsJson ?? "--"}
              </pre>
            </div>
          </section>
        )}

        <section className="space-y-4 rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-xl font-semibold">Records</h2>
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm text-slate-600">
                Status
                <select
                  className="ml-2 rounded-md border border-slate-200 px-2 py-1 text-sm"
                  value={statusParam}
                  onChange={(event) => handleParamChange("status", event.target.value)}
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-slate-600">
                Page size
                <select
                  className="ml-2 rounded-md border border-slate-200 px-2 py-1 text-sm"
                  value={String(pageSize)}
                  onChange={(event) => handleParamChange("pageSize", event.target.value)}
                >
                  {pageSizeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-slate-600">
                Buscar
                <Input
                  className="ml-2 inline-flex w-56"
                  value={search}
                  onChange={(event) => handleParamChange("q", event.target.value)}
                  placeholder="Buscar no preview"
                />
              </label>
            </div>
          </div>

          {search ? (
            <p className="text-xs text-slate-500">Filtragem local aplicada aos resultados atuais.</p>
          ) : null}

          {recordsQuery.isLoading ? (
            <div className="rounded-xl border border-slate-100 p-6 text-sm text-slate-500">
              Carregando records...
            </div>
          ) : recordsQuery.isError ? (
            <div className="rounded-xl border border-slate-100 p-6 text-sm text-slate-500">
              Nao foi possivel carregar os records.
              <Button
                variant="outline"
                className="ml-3"
                onClick={() => recordsQuery.refetch()}
              >
                Tentar novamente
              </Button>
            </div>
          ) : (
            <>
              <div className="overflow-hidden rounded-xl border border-slate-100">
                <table className="w-full text-left text-sm">
                  <thead className="border-b bg-slate-50">
                    <tr>
                      <th className="px-4 py-3">Record</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Titulo/Nome</th>
                      <th className="px-4 py-3">Website</th>
                      <th className="px-4 py-3">Telefone</th>
                      <th className="px-4 py-3">Criado em</th>
                      <th className="px-4 py-3">Acao</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRecords.map((record) => {
                      const preview = parsePreview(record.rawPreview);
                      const isFocused = record.id === focusRecordId;
                      return (
                        <tr
                          key={record.id}
                          id={`record-${record.id}`}
                          className={`border-b ${isFocused ? "bg-amber-50" : "bg-white"}`}
                        >
                          <td className="px-4 py-3 font-mono text-xs text-slate-500">
                            {record.id.slice(0, 8)}
                          </td>
                          <td className="px-4 py-3">{record.status}</td>
                          <td className="px-4 py-3">{recordTitle(record)}</td>
                          <td className="px-4 py-3">
                            {preview.website !== "-" ? (
                              <a
                                href={preview.website}
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-600 underline-offset-2 hover:underline"
                              >
                                {preview.website}
                              </a>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-4 py-3">—</td>
                          <td className="px-4 py-3">—</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-2">
                              {record.status === "conflict" ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setSelectedRecord(record)}
                                >
                                  Resolver
                                </Button>
                              ) : null}
                              {!record.companyId ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setPublishRecord(record)}
                                >
                                  Criar company
                                </Button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {!filteredRecords.length && (
                      <tr>
                        <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                          Nenhum record encontrado.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between text-sm text-slate-500">
                <span>
                  Total: {total} | Pagina {page} de {totalPages}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(Math.max(page - 1, 1))}
                    disabled={page <= 1}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(Math.min(page + 1, totalPages))}
                    disabled={page >= totalPages}
                  >
                    Proximo
                  </Button>
                </div>
              </div>
            </>
          )}
        </section>
        <SerpapiResolveConflictModal
          open={Boolean(selectedRecord)}
          record={selectedRecord}
          runId={runIdValue}
          onClose={() => setSelectedRecord(null)}
          onResolve={async (payload) => {
            await resolveMutation.mutateAsync(payload);
            await queryClient.invalidateQueries({ queryKey: ["serpapi", "run-records"] });
            await queryClient.invalidateQueries({ queryKey: ["serpapi", "run"] });
            await queryClient.invalidateQueries({ queryKey: ["serpapi", "conflicts-sample"] });
          }}
        />
        <SerpapiPublishRecordModal
          open={Boolean(publishRecord)}
          record={publishRecord}
          runId={runIdValue}
          onClose={() => setPublishRecord(null)}
          onPublish={async (payload) => {
            const response = await publishMutation.mutateAsync(payload);
            await queryClient.invalidateQueries({ queryKey: ["serpapi", "run-records"] });
            await queryClient.invalidateQueries({ queryKey: ["serpapi", "run"] });
            await queryClient.invalidateQueries({ queryKey: ["admin", "companies"] });
            return response;
          }}
        />
      </div>
    </div>
  );
};
