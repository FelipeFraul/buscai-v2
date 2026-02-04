import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useMessagesHistory } from "@/features/messages/api";

const DEFAULT_LIMIT = 50;

const formatDateTime = (value?: string | null) => {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString("pt-BR");
};

export const MessagesHistoryPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const peerE164 = searchParams.get("peerE164") ?? "";
  const direction = searchParams.get("direction") ?? "";
  const offset = Math.max(Number(searchParams.get("offset") ?? 0), 0);

  const query = useMessagesHistory({
    limit: DEFAULT_LIMIT,
    offset,
    peerE164: peerE164 || undefined,
    direction: direction ? (direction as "inbound" | "outbound") : undefined,
  });

  const nextOffset = query.data?.nextOffset ?? null;
  const items = query.data?.items ?? [];

  const hasPrev = offset > 0;
  const hasNext = nextOffset !== null && typeof nextOffset === "number";

  const handleParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (!value) {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    if (key !== "offset") {
      next.set("offset", "0");
    }
    setSearchParams(next);
  };

  const directionLabel = useMemo(() => {
    return direction === "inbound" ? "INBOUND" : direction === "outbound" ? "OUTBOUND" : "TODOS";
  }, [direction]);

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold">Historico de mensagens</h1>
          <p className="text-sm text-slate-500">
            Mensagens inbound/outbound do WhatsApp (read-only).
          </p>
        </header>

        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="grid gap-4 md:grid-cols-3">
            <label className="text-sm text-slate-600">
              Telefone (peerE164)
              <Input
                className="mt-1"
                placeholder="+5515999999999"
                value={peerE164}
                onChange={(event) => handleParam("peerE164", event.target.value)}
              />
            </label>
            <label className="text-sm text-slate-600">
              Direcao
              <select
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                value={direction}
                onChange={(event) => handleParam("direction", event.target.value)}
              >
                <option value="">Todos</option>
                <option value="inbound">Inbound</option>
                <option value="outbound">Outbound</option>
              </select>
            </label>
            <div className="flex items-end gap-2">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setSearchParams({});
                }}
              >
                Limpar filtros
              </Button>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between text-sm text-slate-500">
            <span>
              Filtro: {directionLabel} {peerE164 ? `| ${peerE164}` : ""}
            </span>
            <span>Ultimas {DEFAULT_LIMIT} mensagens</span>
          </div>

          {query.isLoading ? (
            <p className="text-sm text-slate-500">Carregando historico...</p>
          ) : query.isError ? (
            <div className="text-sm text-slate-500">
              Nao foi possivel carregar o historico.
              <Button variant="outline" className="ml-3" onClick={() => query.refetch()}>
                Tentar novamente
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {!items.length ? (
                <div className="rounded-2xl bg-white p-6 text-sm text-slate-500 shadow-sm">
                  Nenhuma mensagem encontrada.
                </div>
              ) : (
                items.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                          item.direction === "inbound"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-blue-50 text-blue-700"
                        }`}
                      >
                        {item.direction}
                      </span>
                      <span className="text-xs text-slate-400">{formatDateTime(item.createdAt)}</span>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{item.text}</p>
                    <div className="mt-4 text-xs text-slate-500">
                      <div>peerE164: {item.peerE164}</div>
                      {item.searchId ? <div>searchId: {item.searchId}</div> : null}
                    </div>
                  </article>
                ))
              )}
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!hasPrev}
              onClick={() => handleParam("offset", String(Math.max(offset - DEFAULT_LIMIT, 0)))}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!hasNext}
              onClick={() => {
                if (nextOffset === null || typeof nextOffset !== "number") return;
                handleParam("offset", String(nextOffset));
              }}
            >
              Proximo
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
};
