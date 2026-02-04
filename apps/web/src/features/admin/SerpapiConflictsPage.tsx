import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { apiClient } from "@/lib/api/client";
import type { SerpapiRecordItem } from "@/features/admin/serpapi/api";
import {
  usePublishSerpapiRecordToCompany,
  useRunRecordsQuery,
  useRunsQuery,
  useResolveSerpapiConflict,
} from "@/features/admin/serpapi/api";
import { SerpapiPublishRecordModal } from "@/features/admin/serpapi/SerpapiPublishRecordModal";
import { SerpapiResolveConflictModal } from "@/features/admin/serpapi/SerpapiResolveConflictModal";

type ConflictRow = {
  runId: string;
  record: SerpapiRecordItem;
};

const pageSizeOptions = [10, 25, 50] as const;

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

export const SerpapiConflictsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [draftRunId, setDraftRunId] = useState(searchParams.get("runId") ?? "");
  const queryClient = useQueryClient();
  const resolveMutation = useResolveSerpapiConflict();
  const publishMutation = usePublishSerpapiRecordToCompany();
  const [selectedRow, setSelectedRow] = useState<ConflictRow | null>(null);
  const [publishRow, setPublishRow] = useState<ConflictRow | null>(null);

  const runId = searchParams.get("runId") ?? "";
  const page = Math.max(Number(searchParams.get("page") ?? 1), 1);
  const rawLimit = Number(searchParams.get("limit") ?? 10);
  const limit = pageSizeOptions.includes(rawLimit as (typeof pageSizeOptions)[number])
    ? rawLimit
    : 10;
  const offset = (page - 1) * limit;

  const runsQuery = useRunsQuery(1, 25);
  const recordsQuery = useRunRecordsQuery(runId || null, {
    status: "conflict",
    limit,
    offset,
  });

  const sampleQuery = useQuery({
    queryKey: ["serpapi", "conflicts-sample", runsQuery.data?.map((run) => run.id).join(",")],
    enabled: !runId && Boolean(runsQuery.data?.length),
    queryFn: async () => {
      const runs = runsQuery.data ?? [];
      const rows: ConflictRow[] = [];
      for (const run of runs) {
        if (rows.length >= 100) break;
        const response = await apiClient.get(`/admin/serpapi/runs/${run.id}/records`, {
          params: { status: "conflict", limit: 10, offset: 0 },
        });
        const items = (response.data?.items ?? []) as SerpapiRecordItem[];
        for (const item of items) {
          rows.push({ runId: run.id, record: item });
          if (rows.length >= 100) break;
        }
      }
      return rows;
    },
  });

  const rows = runId
    ? (recordsQuery.data?.items ?? []).map((record) => ({ runId, record }))
    : (sampleQuery.data ?? []);

  const total = runId ? recordsQuery.data?.total ?? 0 : rows.length;
  const pagedRows = runId ? rows : rows.slice(offset, offset + limit);
  const totalPages = Math.max(Math.ceil(total / limit), 1);

  const headerText = runId ? `Run ID: ${runId}` : "Mostrando amostra (adicione runId para ver tudo).";

  const handleApply = () => {
    const next = new URLSearchParams(searchParams);
    if (draftRunId.trim()) {
      next.set("runId", draftRunId.trim());
    } else {
      next.delete("runId");
    }
    next.set("page", "1");
    next.set("limit", String(limit));
    setSearchParams(next);
  };

  const handlePageChange = (nextPage: number) => {
    const next = new URLSearchParams(searchParams);
    next.set("page", String(nextPage));
    setSearchParams(next);
  };

  const handleLimitChange = (value: number) => {
    const next = new URLSearchParams(searchParams);
    next.set("limit", String(value));
    next.set("page", "1");
    setSearchParams(next);
  };

  const isLoading = runId ? recordsQuery.isLoading : sampleQuery.isLoading || runsQuery.isLoading;
  const isError = runId ? recordsQuery.isError : sampleQuery.isError;
  const refetchCurrent = runId ? recordsQuery.refetch : sampleQuery.refetch;

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">Conflitos SerpAPI</h1>
            <p className="text-sm text-slate-500">{headerText}</p>
          </div>
          <Button asChild variant="outline">
            <Link to="/admin/serpapi">Voltar</Link>
          </Button>
        </div>

        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-end gap-4">
            <label className="text-sm text-slate-600">
              Run ID
              <Input
                className="mt-1 w-72"
                value={draftRunId}
                onChange={(event) => setDraftRunId(event.target.value)}
                placeholder="Opcional"
              />
            </label>
            <div className="flex gap-2">
              <Button onClick={handleApply}>Aplicar</Button>
              {runId && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setDraftRunId("");
                    const next = new URLSearchParams(searchParams);
                    next.delete("runId");
                    next.set("page", "1");
                    setSearchParams(next);
                  }}
                >
                  Limpar
                </Button>
              )}
            </div>
            <label className="text-sm text-slate-600">
              Page size
              <select
                className="ml-2 rounded-md border border-slate-200 px-2 py-1 text-sm"
                value={String(limit)}
                onChange={(event) => handleLimitChange(Number(event.target.value))}
              >
                {pageSizeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="space-y-4 rounded-2xl bg-white p-6 shadow-sm">
          {isLoading ? (
            <div className="rounded-xl border border-slate-100 p-6 text-sm text-slate-500">
              Carregando conflitos...
            </div>
          ) : isError ? (
            <div className="rounded-xl border border-slate-100 p-6 text-sm text-slate-500">
              Nao foi possivel carregar os conflitos.
              <Button variant="outline" className="ml-3" onClick={() => refetchCurrent()}>
                Tentar novamente
              </Button>
            </div>
          ) : (
            <>
              <div className="overflow-hidden rounded-xl border border-slate-100">
                <table className="w-full text-left text-sm">
                  <thead className="border-b bg-slate-50">
                    <tr>
                      <th className="px-4 py-3">Run</th>
                      <th className="px-4 py-3">Record</th>
                      <th className="px-4 py-3">Titulo/Nome</th>
                      <th className="px-4 py-3">Website</th>
                      <th className="px-4 py-3">Telefone</th>
                      <th className="px-4 py-3">Criado em</th>
                      <th className="px-4 py-3">Acao</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRows.map(({ runId: rowRunId, record }) => {
                      const preview = parsePreview(record.rawPreview);
                      const title = preview.title !== "-" ? preview.title : preview.name;
                      return (
                        <tr key={`${rowRunId}-${record.id}`} className="border-b bg-white">
                          <td className="px-4 py-3 font-mono text-xs text-slate-500">
                            {rowRunId.slice(0, 8)}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-500">
                            {record.id.slice(0, 8)}
                          </td>
                          <td className="px-4 py-3">{title}</td>
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
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setSelectedRow({ runId: rowRunId, record })}
                              >
                                Resolver
                              </Button>
                              {!record.companyId ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setPublishRow({ runId: rowRunId, record })}
                                >
                                  Criar company
                                </Button>
                              ) : null}
                              <Button asChild size="sm" variant="ghost">
                                <Link to={`/admin/serpapi/runs/${rowRunId}?status=conflict&focusRecordId=${record.id}`}>
                                  Abrir run
                                </Link>
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {!pagedRows.length && (
                      <tr>
                        <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                          Nenhum conflito encontrado.
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
          open={Boolean(selectedRow)}
          record={selectedRow?.record ?? null}
          runId={selectedRow?.runId ?? null}
          onClose={() => setSelectedRow(null)}
          onResolve={async (payload) => {
            await resolveMutation.mutateAsync(payload);
            await queryClient.invalidateQueries({ queryKey: ["serpapi", "run-records"] });
            await queryClient.invalidateQueries({ queryKey: ["serpapi", "conflicts-sample"] });
            await queryClient.invalidateQueries({ queryKey: ["serpapi", "runs"] });
          }}
        />
        <SerpapiPublishRecordModal
          open={Boolean(publishRow)}
          record={publishRow?.record ?? null}
          runId={publishRow?.runId ?? null}
          onClose={() => setPublishRow(null)}
          onPublish={async (payload) => {
            const response = await publishMutation.mutateAsync(payload);
            await queryClient.invalidateQueries({ queryKey: ["serpapi", "run-records"] });
            await queryClient.invalidateQueries({ queryKey: ["serpapi", "conflicts-sample"] });
            await queryClient.invalidateQueries({ queryKey: ["serpapi", "runs"] });
            await queryClient.invalidateQueries({ queryKey: ["admin", "companies"] });
            return response;
          }}
        />
      </div>
    </div>
  );
};
