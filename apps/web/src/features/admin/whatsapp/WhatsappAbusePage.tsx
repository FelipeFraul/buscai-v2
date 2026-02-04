import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  useBlockWhatsappNumber,
  useUnblockWhatsappNumber,
  useWhatsappAbuseAlerts,
} from "./api";

const formatDateTime = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR");
};

export const WhatsappAbusePage = () => {
  const { data, isLoading } = useWhatsappAbuseAlerts();
  const blockNumber = useBlockWhatsappNumber();
  const unblockNumber = useUnblockWhatsappNumber();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Alertas WhatsApp</h2>
          <p className="text-sm text-slate-600">
            Monitoramento de numeros que repetem consultas e geram risco de abuso.
          </p>
        </div>
      </div>

      <Card className="p-5">
        <h3 className="text-lg font-semibold text-slate-900">Mesmo nicho (janela 1h)</h3>
        {isLoading ? (
          <p className="text-sm text-slate-500">Carregando alertas...</p>
        ) : data?.sameNiche.length ? (
          <div className="mt-4 space-y-3">
            {data.sameNiche.map((item) => (
              <div
                key={`${item.phone}-${item.nicheId}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">{item.phone}</p>
                  <p className="text-xs text-slate-500">
                    Nicho: {item.nicheLabel ?? item.nicheId ?? "—"} • {item.count} consultas
                  </p>
                  <p className="text-xs text-slate-500">
                    Ultima: {formatDateTime(item.lastAt)} • Bloqueio:{" "}
                    {formatDateTime(item.blockedUntil)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      blockNumber.mutate({
                        phone: item.phone,
                        durationHours: 24,
                        reason: "admin_alert_same_niche",
                      })
                    }
                  >
                    Bloquear 24h
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => unblockNumber.mutate(item.phone)}
                  >
                    Desbloquear
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">Nenhum alerta neste momento.</p>
        )}
      </Card>

      <Card className="p-5">
        <h3 className="text-lg font-semibold text-slate-900">Nichos diferentes (janela 6h)</h3>
        {isLoading ? (
          <p className="text-sm text-slate-500">Carregando alertas...</p>
        ) : data?.distinctNiches.length ? (
          <div className="mt-4 space-y-3">
            {data.distinctNiches.map((item) => (
              <div
                key={item.phone}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">{item.phone}</p>
                  <p className="text-xs text-slate-500">
                    {item.count} nichos diferentes • Ultima: {formatDateTime(item.lastAt)}
                  </p>
                  <p className="text-xs text-slate-500">
                    Bloqueio: {formatDateTime(item.blockedUntil)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      blockNumber.mutate({
                        phone: item.phone,
                        durationHours: 6,
                        reason: "admin_alert_distinct_niche",
                      })
                    }
                  >
                    Bloquear 6h
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => unblockNumber.mutate(item.phone)}
                  >
                    Desbloquear
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">Nenhum alerta neste momento.</p>
        )}
      </Card>

      <Card className="p-5">
        <h3 className="text-lg font-semibold text-slate-900">Bloqueios atuais</h3>
        {isLoading ? (
          <p className="text-sm text-slate-500">Carregando bloqueios...</p>
        ) : data?.blocks.length ? (
          <div className="mt-4 space-y-3">
            {data.blocks.map((block) => (
              <div
                key={`${block.phone}-${block.blockedUntil}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">{block.phone}</p>
                  <p className="text-xs text-slate-500">
                    Motivo: {block.reason} • Ate: {formatDateTime(block.blockedUntil)}
                  </p>
                  <p className="text-xs text-slate-500">
                    Atualizado: {formatDateTime(block.updatedAt)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => unblockNumber.mutate(block.phone)}
                >
                  Desbloquear
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">Nenhum bloqueio ativo.</p>
        )}
      </Card>
    </div>
  );
};
