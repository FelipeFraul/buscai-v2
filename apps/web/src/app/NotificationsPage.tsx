import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useMeCompany } from "./useMeCompany";
import {
  type NotificationCategory,
  type NotificationItem,
  type NotificationPreferencesUpdate,
  useNotificationPreferences,
  useNotifications,
  useUpdateNotificationPreferences,
} from "@/features/notifications/api";

const categoryLabels: Record<NotificationCategory, string> = {
  financial: "Financeiro",
  visibility: "Visibilidade",
  subscription: "Assinatura e Produtos",
  contacts: "Contatos",
  system: "Sistema",
};

const categoryStyles: Record<NotificationCategory, string> = {
  financial: "bg-emerald-50 text-emerald-700 border-emerald-200",
  visibility: "bg-sky-50 text-sky-700 border-sky-200",
  subscription: "bg-amber-50 text-amber-700 border-amber-200",
  contacts: "bg-indigo-50 text-indigo-700 border-indigo-200",
  system: "bg-slate-100 text-slate-700 border-slate-200",
};

const frequencyOptions = [
  { id: "real_time", label: "Tempo real", helper: "Atualiza conforme acontece" },
  { id: "daily", label: "Resumo diário", helper: "Todo dia às 19h" },
  { id: "weekly", label: "Resumo semanal", helper: "Segunda-feira às 9h" },
  { id: "never", label: "Nunca", helper: "Silenciar notificações" },
];

const Toggle = ({
  enabled,
  onChange,
  label,
}: {
  enabled: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) => (
  <button
    type="button"
    onClick={() => onChange(!enabled)}
    aria-pressed={enabled}
    aria-label={label}
    className={[
      "relative inline-flex h-6 w-11 items-center rounded-full transition",
      enabled ? "bg-emerald-500" : "bg-slate-300",
    ].join(" ")}
  >
    <span
      className={[
        "inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition",
        enabled ? "translate-x-5" : "translate-x-1",
      ].join(" ")}
    />
  </button>
);

export const NotificationsPage = () => {
  const { data: meCompany, isLoading: meCompanyLoading } = useMeCompany();
  const companyId = meCompany?.company?.id;
  const preferencesQuery = useNotificationPreferences(companyId);
  const updatePreferences = useUpdateNotificationPreferences();

  const preferences = preferencesQuery.data;
  const [selectedCategory, setSelectedCategory] = useState<NotificationCategory | "all">("all");

  const notificationsQuery = useNotifications(
    { companyId, limit: 60 },
    { enabled: Boolean(companyId) }
  );

  const hasCompany = Boolean(companyId);
  const showCreateCompanyCard = !meCompanyLoading && !hasCompany;

  if (showCreateCompanyCard) {
    return (
      <div className="space-y-6 pb-10">
        <Card className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 text-slate-900">
          <p className="text-xs uppercase tracking-wide text-slate-500">Notificações</p>
          <h1 className="text-2xl font-bold text-slate-900">
            Crie sua empresa para ativar notificações
          </h1>
          <p className="text-sm text-slate-600">
            É preciso cadastrar e vincular uma empresa antes de liberar alertas e preferências
            personalizadas.
          </p>
          <Button className="w-full" asChild>
            <Link to="/companies/new">Criar empresa</Link>
          </Button>
        </Card>
      </div>
    );
  }
  const notifications = notificationsQuery.data?.items ?? [];
  const handleRefresh = () => {
    notificationsQuery.refetch();
    preferencesQuery.refetch();
  };

  const notificationsOn = preferences?.panelEnabled ?? true;

  const categoryPreferences: Record<NotificationCategory, boolean> = {
    financial: preferences?.financialEnabled ?? true,
    visibility: preferences?.visibilityEnabled ?? true,
    subscription: preferences?.subscriptionEnabled ?? true,
    contacts: preferences?.contactsEnabled ?? true,
    system: preferences?.systemEnabled ?? false,
  };

  const frequency = preferences?.frequency ?? "real_time";

  const updatePreference = (payload: NotificationPreferencesUpdate) => {
    updatePreferences.mutate(payload);
  };

  const alerts = useMemo(
    () => notifications.filter((item) => item.severity === "high").slice(0, 3),
    [notifications]
  );

  const visibleFeed = useMemo(() => {
    if (selectedCategory === "all") {
      return notifications;
    }
    return notifications.filter((item) => item.category === selectedCategory);
  }, [notifications, selectedCategory]);

  const updateCategoryPreference = (category: NotificationCategory, value: boolean) => {
    updatePreference({ [`${category}Enabled`]: value } as NotificationPreferencesUpdate);
  };

  const formatTimestamp = (value?: string | null) => {
    if (!value) return "Agora";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }
    return parsed.toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  };

  const formatCta = (item: NotificationItem) => {
    if (!item.ctaLabel || !item.ctaUrl) {
      return null;
    }
    return { label: item.ctaLabel, to: item.ctaUrl };
  };

  return (
    <div className="space-y-10 pb-10">
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Área de Notificações</h1>
            <p className="text-sm text-slate-600">
              Controle total para receber só o que gera dinheiro, visibilidade e operação saudável.
            </p>
          </div>
          <Button className="bg-slate-900 text-white hover:bg-slate-800" onClick={handleRefresh}>
            Atualizar agora
          </Button>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Alertas importantes</h2>
            <p className="text-sm text-slate-600">Apenas itens críticos, sem spam.</p>
          </div>
          <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
            Alta prioridade
          </span>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          {alerts.map((alert) => {
            const cta = formatCta(alert);
            return (
            <Card key={alert.id} className="flex h-full flex-col gap-3 border-rose-200 bg-white">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-1 text-[11px] font-semibold text-rose-700">
                  Ação necessária
                </span>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">{alert.title}</p>
                <p className="text-xs text-slate-600">{alert.message ?? alert.reason}</p>
              </div>
              {cta ? (
                <Link
                  to={cta.to}
                  className="mt-auto inline-flex w-fit items-center rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white transition hover:bg-slate-800"
                >
                  {cta.label}
                </Link>
              ) : null}
            </Card>
          )})}
          {alerts.length === 0 ? (
            <Card className="border-slate-200 bg-slate-50 text-sm text-slate-600">
              Nenhum alerta critico no momento.
            </Card>
          ) : null}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Atividade</h2>
            <p className="text-sm text-slate-600">Feed cronológico com o porquê de cada evento.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedCategory("all")}
              className={[
                "rounded-full border px-3 py-1 text-xs font-semibold transition",
                selectedCategory === "all"
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
              ].join(" ")}
            >
              Todas
            </button>
            {(Object.keys(categoryLabels) as NotificationCategory[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedCategory(key)}
                className={[
                  "rounded-full border px-3 py-1 text-xs font-semibold transition",
                  selectedCategory === key
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                ].join(" ")}
              >
                {categoryLabels[key]}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {notificationsQuery.isLoading ? (
            <Card className="border-slate-200 bg-slate-50 text-sm text-slate-600">
              Carregando atividade...
            </Card>
          ) : null}
          {!notificationsQuery.isLoading &&
            visibleFeed.map((item) => {
            const cta = formatCta(item);
            return (
            <Card key={item.id} className="flex flex-col gap-3 border-slate-200 bg-white md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${categoryStyles[item.category]}`}>
                    {categoryLabels[item.category]}
                  </span>
                  <span className="text-xs text-slate-500">{formatTimestamp(item.createdAt)}</span>
                </div>
                <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                <p className="text-xs text-slate-600">{item.message ?? item.reason}</p>
              </div>
              {cta ? (
                <Link
                  to={cta.to}
                  className="inline-flex w-fit items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-800 transition hover:bg-slate-50"
                >
                  {cta.label}
                </Link>
              ) : null}
            </Card>
          )})}
          {!notificationsQuery.isLoading && visibleFeed.length === 0 ? (
            <Card className="border-slate-200 bg-slate-50 text-sm text-slate-600">
              Nenhuma atividade nessa categoria hoje.
            </Card>
          ) : null}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Preferências e pausa</h2>
            <p className="text-sm text-slate-600">Controle total para não virar inferno.</p>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            Painel do empresário
          </span>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <Card className="space-y-6 border-slate-200 bg-white">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Receber notificações no painel</p>
                <p className="text-xs text-slate-500">Master switch: pausa tudo quando desligado.</p>
              </div>
              <Toggle
                enabled={notificationsOn}
                onChange={(value) => updatePreference({ panelEnabled: value })}
                label="Receber notificações no painel"
              />
            </div>

            <div className="space-y-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Categorias</p>
              {(Object.keys(categoryLabels) as NotificationCategory[]).map((category) => (
                <div key={category} className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{categoryLabels[category]}</p>
                    <p className="text-xs text-slate-500">Pausar categoria individual.</p>
                  </div>
                  <Toggle
                    enabled={categoryPreferences[category]}
                    onChange={(value) => updateCategoryPreference(category, value)}
                    label={`Alternar ${categoryLabels[category]}`}
                  />
                </div>
              ))}
            </div>
          </Card>

          <Card className="space-y-6 border-slate-200 bg-white">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-slate-500">Frequência</p>
              <div className="space-y-2">
                {frequencyOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => updatePreference({ frequency: option.id })}
                    className={[
                      "flex w-full items-center justify-between rounded-2xl border px-3 py-2 text-left transition",
                      frequency === option.id
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                    ].join(" ")}
                  >
                    <span className="text-sm font-semibold">{option.label}</span>
                    <span className={`text-xs ${frequency === option.id ? "text-slate-200" : "text-slate-500"}`}>
                      {option.helper}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Canais</p>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Painel</p>
                  <p className="text-xs text-slate-500">Sempre ativo</p>
                </div>
                <div className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                  Ativo
                </div>
              </div>
              {[
                { label: "WhatsApp", helper: "Em breve" },
                { label: "Email", helper: "Em breve" },
              ].map((channel) => (
                <div key={channel.label} className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{channel.label}</p>
                    <p className="text-xs text-slate-500">{channel.helper}</p>
                  </div>
                  <div className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                    Bloqueado
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
};
