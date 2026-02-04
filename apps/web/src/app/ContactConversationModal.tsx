import { useEffect } from "react";

import { useMessageHistory } from "./useMessageHistory";

type Props = {
  open: boolean;
  peerE164: string | null;
  title?: string | null;
  onClose: () => void;
};

export const ContactConversationModal = ({ open, peerE164, title, onClose }: Props) => {
  const { data, isLoading, isError, refetch } = useMessageHistory(peerE164, {
    limit: 60,
  });

  useEffect(() => {
    if (!open) return;
    refetch();
  }, [open, refetch]);

  if (!open) {
    return null;
  }

  const items = (data?.items ?? []).slice().reverse();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <p className="text-sm text-slate-500">Conversa</p>
            <p className="text-base font-semibold text-slate-900">
              {title?.trim() || peerE164 || "Contato"}
            </p>
            {peerE164 ? (
              <p className="text-xs text-slate-500">Telefone: {peerE164}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Fechar
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isLoading ? (
            <p className="text-sm text-slate-500">Carregando conversa...</p>
          ) : isError ? (
            <p className="text-sm text-amber-700">Nao foi possivel carregar a conversa.</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-slate-500">Sem historico de mensagens.</p>
          ) : (
            <div className="space-y-3">
              {items.map((item) => {
                const isOutbound = item.direction === "outbound";
                return (
                  <div
                    key={item.id}
                    className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={[
                        "max-w-[75%] rounded-2xl px-4 py-2 text-sm",
                        isOutbound ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-900",
                      ].join(" ")}
                    >
                      <p className="whitespace-pre-wrap">{item.text}</p>
                      <p className={`mt-1 text-[10px] ${isOutbound ? "text-white/70" : "text-slate-500"}`}>
                        {new Date(item.createdAt).toLocaleString("pt-BR")}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
