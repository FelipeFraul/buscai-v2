import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { Card } from "@/components/ui/Card";
import { formatCurrencyFromCents } from "@/lib/utils";
import { useAuctionDashboard, type DashboardRangeKey } from "./useAuctionDashboard";
import { useCompanySelection } from "@/features/companies/useCompanySelection";
import { useRecentContacts, type ContactRecord } from "./useRecentContacts";
import { ContactConversationModal } from "./ContactConversationModal";

type ContactChannel = "whatsapp" | "call";
type ContactClassification = "curious" | "new_client" | "recurring" | "quote";

const periodOptions: Array<{ key: DashboardRangeKey; label: string; short: string; description: string }> = [
  { key: "today", label: "Hoje", short: "Hoje", description: "hoje" },
  { key: "yesterday", label: "Ontem", short: "Ontem", description: "ontem" },
  { key: "7d", label: "7 dias", short: "7d", description: "nos últimos 7 dias" },
  { key: "15d", label: "15 dias", short: "15d", description: "nos últimos 15 dias" },
  { key: "30d", label: "30 dias", short: "30d", description: "nos últimos 30 dias" },
  { key: "90d", label: "3 meses", short: "3m", description: "nos últimos 3 meses" },
  { key: "365d", label: "1 ano", short: "1 ano", description: "no último ano" },
];

const channelBadge = (type: ContactChannel) => {
  if (type === "whatsapp") {
    return { label: "WhatsApp", className: "text-emerald-700 bg-emerald-50" };
  }
  return { label: "Ligação", className: "text-slate-700 bg-slate-100" };
};

const classificationLabel: Record<ContactClassification, string> = {
  curious: "Curioso",
  new_client: "Cliente novo",
  recurring: "Recorrente",
  quote: "Orçamento",
};

const formatCurrency = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const EMPTY_DASHBOARD = {
  moment: {
    appearancesToday: 0,
    contactsToday: 0,
    costPerContactToday: 0,
    creditsSpentToday: 0,
    currentPositionMainNiche: null as number | null,
  },
  period: {
    impressions: 0,
    contacts: 0,
    totalSpent: 0,
    bestDayOfWeek: null as string | null,
    bestHour: null as string | null,
    topNiche: null as { nicheId: string; niche: string; total: number } | null,
  },
  niches: [] as Array<{
    nicheId: string;
    nicheName: string;
    positionToday: number | null;
    iecToday: number;
    impressionsToday: number;
    contactsToday: number;
    activeReserve: number;
  }>,
};

const formatContactTime = (createdAt: string) => {
  const date = new Date(createdAt);
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (date.toDateString() === now.toDateString()) {
    return time;
  }
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;
};

const MiniStat = ({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) => (
  <div className="rounded-2xl bg-slate-50 px-4 py-3">
    <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
    <p className={`text-2xl font-bold text-slate-900 leading-tight break-words ${valueClassName ?? ""}`}>{value}</p>
  </div>
);

const NicheCard = ({
  niche,
}: {
  niche: {
    nicheId: string;
    nicheName: string;
    positionToday: number | null;
    impressionsToday: number;
    contactsToday: number;
    activeReserve: number;
    iecToday: number;
  };
}) => (
  <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex items-start justify-between gap-3">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-slate-500">Nicho</p>
        <h3 className="text-base font-semibold text-slate-900">{niche.nicheName}</h3>
      </div>
      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-800">
        Posição: {niche.positionToday ?? "—"}
      </span>
    </div>
    <div className="grid grid-cols-2 gap-2 text-sm text-slate-700">
      <p>
        <span className="font-semibold text-slate-900">Impressões hoje:</span> {niche.impressionsToday}
      </p>
      <p>
        <span className="font-semibold text-slate-900">Contatos hoje:</span> {niche.contactsToday}
      </p>
      <p>
        <span className="font-semibold text-slate-900">Reserva ativa:</span> {formatCurrency(niche.activeReserve)}
      </p>
      <p>
        <span className="font-semibold text-slate-900">IEC hoje:</span> {niche.iecToday.toFixed(2)}
      </p>
    </div>
    <div className="flex justify-end">
      <button
        type="button"
        className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-800 transition hover:bg-slate-100"
        onClick={() => console.log("Editar lance", niche.nicheId)}
      >
        Editar lance
      </button>
    </div>
  </div>
);

export const DashboardPage = () => {
  const [selectedPeriod, setSelectedPeriod] = useState<DashboardRangeKey>("7d");
  const { selectedCompanyId } = useCompanySelection();
  const companyId = selectedCompanyId;
  const [selectedContact, setSelectedContact] = useState<ContactRecord | null>(null);

  const {
    data: dashboardData,
    isLoading: dashboardLoading,
    isError: dashboardError,
    refetch: refetchDashboard,
  } = useAuctionDashboard(selectedPeriod, companyId);

  const {
    data: contactsData,
    isLoading: contactsLoading,
    isError: contactsError,
    refetch: refetchContacts,
  } = useRecentContacts(companyId, { limit: 6 });

  const dashboard = dashboardError || !dashboardData ? EMPTY_DASHBOARD : dashboardData;
  // Debug auxiliar para conferência no navegador
  // eslint-disable-next-line no-console
  console.log("[DEBUG] analytics dashboard", dashboardData);

  const period = dashboard.period;
  const moment = dashboard.moment;
  const niches = dashboard.niches ?? [];

  const [selectedNiche, setSelectedNiche] = useState<string>("all");

  const nicheOptions = useMemo(() => {
    type Opt = { key: string; label: string };
    const base: Opt[] = [{ key: "all", label: "Todos os seus nichos" }];
    return [
      ...base,
      ...niches.map((niche) => ({ key: niche.nicheId, label: niche.nicheName })),
    ];
  }, [niches]);

  const filteredNiches = selectedNiche === "all" ? niches : niches.filter((n) => n.nicheId === selectedNiche);

  const bestNicheLabel = period.topNiche?.niche ?? "—";
  const totalContactsPeriod = period.contacts ?? 0;
  const totalImpressions = period.impressions ?? 0;
  const totalSpent = period.totalSpent ?? 0;
  const costPerContact = period.contacts > 0 ? period.totalSpent / period.contacts : 0;

  const contacts = contactsError || !contactsData ? [] : contactsData.items ?? [];
  const visibleContacts = contacts.slice(0, 3);
  const remainingContacts = Math.max((contactsData?.total ?? contacts.length) - visibleContacts.length, 0);

  const loading = dashboardLoading;
  const hasError = dashboardError;

  return (
    <div className="space-y-10 pb-10">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Leilão — Resultado do momento</h1>
            <p className="text-sm text-slate-600">Veja se você está aparecendo, recebendo contatos e em que posição está no nicho.</p>
          </div>
          <Link
            to="/configuracoes/leiloes"
            className="inline-flex h-10 items-center justify-center rounded-md bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
          >
            Ir para gestão de leilão
          </Link>
        </div>
      </section>

      {hasError ? (
        <Card className="border-amber-200 bg-amber-50 text-amber-900">
          Não foi possível carregar os dados de leilão. Tente novamente mais tarde.
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white"
              onClick={() => refetchDashboard()}
            >
              Tentar novamente
            </button>
          </div>
        </Card>
      ) : null}

      <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Resultado por períodos</h2>
            <p className="text-sm text-slate-600">Escolha o período preferido e veja os números</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/lances"
              className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white transition hover:bg-slate-800"
            >
              Aumentar posição
            </Link>
            <Link
              to="/creditos"
              className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 transition hover:bg-amber-100"
            >
              Adicionar créditos
            </Link>
            <button
              type="button"
              onClick={() => refetchDashboard()}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-800 transition hover:bg-slate-100"
            >
              Atualizar
            </button>
            <select
              className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm focus:border-slate-300 focus:outline-none"
              value={selectedPeriod}
              onChange={(event) => setSelectedPeriod(event.target.value as DashboardRangeKey)}
            >
              {periodOptions.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label}
                </option>
              ))}
            </select>
            <select
              className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm focus:border-slate-300 focus:outline-none"
              value={selectedNiche}
              onChange={(event) => setSelectedNiche(event.target.value)}
            >
              {nicheOptions.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {loading ? (
          <Card className="bg-slate-50 text-slate-600">Carregando dados...</Card>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
              <MiniStat label="Você apareceu" value={totalImpressions.toLocaleString("pt-BR")} />
              <MiniStat label="Cliques no link" value={totalContactsPeriod.toLocaleString("pt-BR")} />
              <MiniStat label="Gasto total" value={formatCurrencyFromCents(totalSpent)} />
              <MiniStat label="Custo p. contato" value={formatCurrencyFromCents(costPerContact)} />
              <MiniStat label="Melhor dia" value={period.bestDayOfWeek ?? "—"} />
              <MiniStat label="Melhor horário" value={period.bestHour ?? "—"} />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800">
                <p className="font-semibold text-slate-900">Diagnóstico automático</p>
                <p>
                  {totalContactsPeriod > 0
                    ? "Continue monitorando seus lances e créditos para manter o ritmo."
                    : "Ainda não há dados suficientes neste período para gerar um diagnóstico."}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800">
                <p className="text-xs uppercase tracking-wide text-slate-500">Nicho que melhor performou</p>
                <p className="text-base font-semibold text-slate-900">{bestNicheLabel}</p>
              </div>
            </div>
          </>
        )}
      </section>

      <ContactConversationModal
        open={Boolean(selectedContact)}
        peerE164={selectedContact?.phone ?? null}
        title={selectedContact?.name ?? null}
        onClose={() => setSelectedContact(null)}
      />

      <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-bold text-slate-900">Últimos contatos</h2>
          <p className="text-sm text-slate-600">Veja quem entrou em contato com você nos últimos dias.</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <div className="space-y-2 rounded-2xl border border-slate-200 bg-white">
            <div className="hidden grid-cols-[110px_120px_150px_150px_1fr] gap-2 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 md:grid">
              <span>Horário</span>
              <span>Canal</span>
              <span>Telefone</span>
              <span>Nome</span>
              <span>Classificação</span>
            </div>
            {contactsLoading ? (
              <div className="px-4 py-6 text-sm text-slate-600">Carregando contatos...</div>
            ) : contactsError ? (
              <div className="px-4 py-6 text-sm text-amber-800">
                Não foi possível carregar os contatos.
                <button
                  type="button"
                  className="ml-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-800 transition hover:bg-slate-50"
                  onClick={() => refetchContacts()}
                >
                  Tentar novamente
                </button>
              </div>
            ) : contacts.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
                <p className="text-base font-semibold text-slate-900">Ainda não houve contatos recentes.</p>
                <p className="text-sm text-slate-600">
                  Assim que alguém entrar em contato pelo WhatsApp ou ligação, você verá os números aqui.
                </p>
              </div>
            ) : (
              <>
                {visibleContacts.map((contact, index) => {
                  const badge = channelBadge(contact.channel as ContactChannel);
                  const classification =
                    contact.classification && classificationLabel[contact.classification as ContactClassification];

                  return (
                    <div
                      key={contact.id}
                      className={[
                        "grid items-center gap-2 px-4 py-3 text-sm text-slate-800 transition hover:bg-slate-50",
                        "md:grid-cols-[110px_120px_150px_150px_1fr]",
                        index !== visibleContacts.length - 1 ? "border-b border-slate-100" : "",
                      ].join(" ")}
                    >
                      <p className="text-slate-600">{formatContactTime(contact.createdAt)}</p>
                      <span className={`inline-flex w-fit shrink-0 items-center rounded-full px-3 py-1 text-xs font-semibold ${badge.className}`}>
                        {badge.label}
                      </span>
                      <button
                        type="button"
                        className="text-left font-semibold text-slate-900 underline-offset-2 hover:underline"
                        onClick={() => setSelectedContact(contact)}
                      >
                        {contact.phone}
                      </button>
                      <p className="text-left text-sm font-semibold text-slate-800">{contact.name?.trim() || "—"}</p>
                      <div className="flex items-center gap-2">
                        {classification ? (
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-800">
                            {classification}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500">Sem classificação</span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {remainingContacts > 0 ? (
                  <p className="px-4 pb-3 text-xs text-slate-500">
                    + {remainingContacts} contatos anteriores não exibidos aqui.
                  </p>
                ) : null}
              </>
            )}
          </div>

          <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-lg font-semibold text-slate-900">
              Hoje você teve {moment?.contactsToday?.toLocaleString("pt-BR") ?? "0"} contatos
            </p>
            <p className="text-sm text-slate-700">
              Use esses números para retornar quem entrou em contato e fechar mais negócios.
            </p>
            <Link
              to="/contatos"
              className="w-full rounded-full bg-[#FFC300] px-4 py-2 text-center text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-amber-400"
            >
              Ver todos os contatos
            </Link>
            {contacts.length === 0 ? (
              <p className="text-xs text-slate-600">
                Dica: aumente sua posição ou seus créditos para começar a receber contatos.
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-slate-900">Seus nichos</h2>
          <p className="text-sm text-slate-600">Acompanhe desempenho básico por nicho.</p>
        </div>
        {loading ? (
          <Card className="bg-slate-50 text-slate-600">Carregando nichos...</Card>
        ) : filteredNiches.length === 0 ? (
          <Card className="bg-slate-50 text-slate-700">Ainda não há dados suficientes para exibir o desempenho por nicho.</Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredNiches.map((niche) => (
              <NicheCard key={niche.nicheId} niche={niche} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
