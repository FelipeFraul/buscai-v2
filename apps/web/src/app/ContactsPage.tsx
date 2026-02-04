import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { Card } from "@/components/ui/Card";
import { useCompanySelection } from "@/features/companies/useCompanySelection";
import { ContactConversationModal } from "./ContactConversationModal";
import { useContacts, type ContactRecord } from "./useContacts";

type ContactChannel = "whatsapp" | "call";
type ContactClassification = "curious" | "new_client" | "recurring" | "quote";

const channelBadge = (type: ContactChannel) => {
  if (type === "whatsapp") {
    return { label: "WhatsApp", className: "text-emerald-700 bg-emerald-50" };
  }
  return { label: "Ligacao", className: "text-slate-700 bg-slate-100" };
};

const classificationLabel: Record<ContactClassification, string> = {
  curious: "Curioso",
  new_client: "Cliente novo",
  recurring: "Recorrente",
  quote: "Orcamento",
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

const ContactTable = ({
  title,
  description,
  contacts,
  isLoading,
  isError,
  onSelect,
}: {
  title: string;
  description: string;
  contacts: ContactRecord[];
  isLoading: boolean;
  isError: boolean;
  onSelect: (contact: ContactRecord) => void;
}) => (
  <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div>
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <p className="text-sm text-slate-600">{description}</p>
    </div>
    <div className="space-y-2 rounded-2xl border border-slate-200 bg-white">
      <div className="hidden grid-cols-[110px_120px_150px_150px_1fr] gap-2 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 md:grid">
        <span>Horario</span>
        <span>Canal</span>
        <span>Telefone</span>
        <span>Nome</span>
        <span>Classificacao</span>
      </div>
      {isLoading ? (
        <div className="px-4 py-6 text-sm text-slate-600">Carregando contatos...</div>
      ) : isError ? (
        <div className="px-4 py-6 text-sm text-amber-800">
          Nao foi possivel carregar os contatos.
        </div>
      ) : contacts.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
          <p className="text-base font-semibold text-slate-900">Sem contatos ainda.</p>
          <p className="text-sm text-slate-600">
            Assim que alguem entrar em contato, os dados aparecem aqui.
          </p>
        </div>
      ) : (
        contacts.map((contact, index) => {
          const badge = channelBadge(contact.channel as ContactChannel);
          const classification =
            contact.classification && classificationLabel[contact.classification as ContactClassification];

          return (
            <div
              key={contact.id}
              className={[
                "grid items-center gap-2 px-4 py-3 text-sm text-slate-800 transition hover:bg-slate-50",
                "md:grid-cols-[110px_120px_150px_150px_1fr]",
                index !== contacts.length - 1 ? "border-b border-slate-100" : "",
              ].join(" ")}
            >
              <p className="text-slate-600">{formatContactTime(contact.createdAt)}</p>
              <span className={`inline-flex w-fit shrink-0 items-center rounded-full px-3 py-1 text-xs font-semibold ${badge.className}`}>
                {badge.label}
              </span>
              <button
                type="button"
                className="text-left font-semibold text-slate-900 underline-offset-2 hover:underline"
                onClick={() => onSelect(contact)}
              >
                {contact.phone}
              </button>
              <p className="text-left text-sm font-semibold text-slate-800">{contact.name?.trim() || "-"}</p>
              <div className="flex items-center gap-2">
                {classification ? (
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-800">
                    {classification}
                  </span>
                ) : (
                  <span className="text-xs text-slate-500">Sem classificacao</span>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  </div>
);

export const ContactsPage = () => {
  const { selectedCompanyId } = useCompanySelection();
  const companyId = selectedCompanyId;
  const [selectedContact, setSelectedContact] = useState<ContactRecord | null>(null);

  const recentQuery = useContacts(companyId, { limit: 20 });
  const newQuery = useContacts(companyId, { classification: "new_client", limit: 20 });
  const recurringQuery = useContacts(companyId, { classification: "recurring", limit: 20 });

  const recentContacts = useMemo(() => recentQuery.data?.items ?? [], [recentQuery.data]);
  const newContacts = useMemo(() => newQuery.data?.items ?? [], [newQuery.data]);
  const recurringContacts = useMemo(() => recurringQuery.data?.items ?? [], [recurringQuery.data]);

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Contatos</h1>
          <p className="text-sm text-slate-600">Acompanhe seus ultimos contatos e classificacoes.</p>
        </div>
        <Link
          to="/leilao"
          className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
        >
          Voltar ao leilao
        </Link>
      </div>

      <ContactTable
        title="Ultimos contatos"
        description="Lista geral com os contatos mais recentes."
        contacts={recentContacts}
        isLoading={recentQuery.isLoading}
        isError={recentQuery.isError}
        onSelect={setSelectedContact}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <ContactTable
          title="Novos contatos"
          description="Contatos classificados como novos."
          contacts={newContacts}
          isLoading={newQuery.isLoading}
          isError={newQuery.isError}
          onSelect={setSelectedContact}
        />
        <ContactTable
          title="Contatos recorrentes"
          description="Quem ja entrou em contato outras vezes."
          contacts={recurringContacts}
          isLoading={recurringQuery.isLoading}
          isError={recurringQuery.isError}
          onSelect={setSelectedContact}
        />
      </div>

      <ContactConversationModal
        open={Boolean(selectedContact)}
        peerE164={selectedContact?.phone ?? null}
        title={selectedContact?.name ?? null}
        onClose={() => setSelectedContact(null)}
      />

      {!companyId ? (
        <Card className="bg-amber-50 text-amber-900">
          Selecione uma empresa para visualizar os contatos.
        </Card>
      ) : null}
    </div>
  );
};
