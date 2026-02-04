import React, { useEffect, useMemo, useState } from "react";

import { useDashboardAnalytics } from "@/features/dashboard/useDashboardAnalytics";
import type { DashboardAnalytics } from "@/features/dashboard/types";
import { useProducts } from "@/features/products/useProducts";
import type { Product } from "@/features/products/types";
import { useNiches } from "@/features/niches/useNiches";
import type { CompanyNiche } from "@/features/niches/types";
import { useAuction } from "@/features/auction/useAuction";
import { CompanySelector } from "@/features/companies/CompanySelector";
import { useCompanySelection } from "@/features/companies/useCompanySelection";

type PlaceholderProps = {
  title: string;
  description?: string;
};

export const Placeholder = ({ title, description }: PlaceholderProps) => (
  <div className="space-y-2">
    <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
    <p className="text-sm text-slate-600">
      {description ?? "Conteúdo em construção."}
    </p>
  </div>
);

type StatCardProps = {
  label: string;
  value: number | string;
};

const StatCard = ({ label, value }: StatCardProps) => (
  <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
    <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
    <p className="text-2xl font-semibold text-slate-900">{value}</p>
  </div>
);

type BarChartProps = {
  title: string;
  data: Array<{ label: string; value: number }>;
};

const BarChart = ({ title, data }: BarChartProps) => {
  const max = data.reduce((acc, item) => Math.max(acc, item.value), 0) || 1;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <div className="mt-3 flex h-32 items-end gap-2">
        {data.map((item) => (
          <div key={item.label} className="flex-1">
            <div
              className="w-full rounded-md bg-slate-900 transition-all"
              style={{ height: `${(item.value / max) * 100}%` }}
              title={`${item.label}: ${item.value}`}
            />
            <p className="mt-1 text-center text-xs text-slate-600">{item.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

type LineChartProps = {
  title: string;
  data: Array<{ label: string; value: number }>;
};

const LineChart = ({ title, data }: LineChartProps) => {
  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <p className="mt-2 text-xs text-slate-500">Sem dados</p>
      </div>
    );
  }

  const width = 300;
  const height = 120;
  const max = data.reduce((acc, item) => Math.max(acc, item.value), 0) || 1;
  const step = data.length > 1 ? width / (data.length - 1) : width;

  const points = data
    .map((item, index) => {
      const x = index * step;
      const y = height - (item.value / max) * height;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <svg viewBox={`0 0 ${width} ${height}`} className="mt-3 w-full">
        <polyline
          fill="none"
          stroke="#0f172a"
          strokeWidth="2"
          points={points}
          strokeLinecap="round"
        />
      </svg>
      <div className="mt-2 flex justify-between text-[10px] text-slate-500">
        {data.map((item) => (
          <span key={item.label}>{item.label}</span>
        ))}
      </div>
    </div>
  );
};

type SimpleTableProps = {
  title: string;
  columns: string[];
  rows: Array<Array<string | number>>;
};

const SimpleTable = ({ title, columns, rows }: SimpleTableProps) => (
  <div className="rounded-lg border border-slate-200 bg-white p-4">
    <p className="text-sm font-semibold text-slate-900">{title}</p>
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            {columns.map((col) => (
              <th key={col} className="px-2 py-1">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-2 py-2 text-xs text-slate-500">
                Sem dados
              </td>
            </tr>
          ) : (
            rows.map((row, idx) => (
              <tr key={idx} className="border-t border-slate-100">
                {row.map((cell, cIdx) => (
                  <td key={cIdx} className="px-2 py-2 text-slate-800">
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  </div>
);

const formatCurrency = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const prepareData = (data: DashboardAnalytics) => {
  const auctionTotal =
    data.appearances.auction.pos1 + data.appearances.auction.pos2 + data.appearances.auction.pos3;
  const organicTotal = data.appearances.organic.pos4 + data.appearances.organic.pos5;

  const peakHoursBars = data.searches.peakHours.map((item) => ({
    label: `${item.hour}h`,
    value: item.total,
  }));

  const clicksByHourBars = data.actions.clicksByHour.map((item) => ({
    label: `${item.hour}h`,
    value: item.total,
  }));

  const volumeLine = data.searches.volumeByDay.map((item) => ({
    label: item.date.slice(5, 10),
    value: item.total,
  }));

  const performanceByDayLine = data.performance.byDay.map((item) => ({
    label: item.date.slice(5, 10),
    value: item.value,
  }));

  return {
    auctionTotal,
    organicTotal,
    peakHoursBars,
    clicksByHourBars,
    volumeLine,
    performanceByDayLine,
  };
};

export const DashboardPage = () => {
  const { data, loading, error, refetch } = useDashboardAnalytics();

  const prepared = useMemo(() => prepareData(data), [data]);

  if (loading) {
    return <p className="text-sm text-slate-600">Carregando dashboard...</p>;
  }

  if (error) {
    return (
      <div className="space-y-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-rose-800">
        <p className="font-medium">Erro ao carregar dashboard.</p>
        <button
          className="text-sm font-semibold underline"
          type="button"
          onClick={() => refetch()}
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Buscas e Demanda</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <StatCard label="Buscas recebidas" value={data.searches.total} />
          <StatCard label="Top nicho" value={data.searches.byNiche[0]?.niche ?? "-"} />
          <StatCard label="Top produto" value={data.searches.byProduct[0]?.product ?? "-"} />
          <StatCard label="Pico de hora" value={prepared.peakHoursBars[0]?.label ?? "-"} />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <p className="text-sm font-semibold text-slate-900">Top 3 por nicho</p>
            <ul className="space-y-2 rounded-lg border border-slate-200 bg-white p-3 text-sm">
              {data.searches.byNiche.slice(0, 3).map((item) => (
                <li key={item.niche} className="flex items-center justify-between">
                  <span className="text-slate-700">{item.niche || "N/A"}</span>
                  <span className="font-semibold text-slate-900">{item.total}</span>
                </li>
              ))}
              {data.searches.byNiche.length === 0 && (
                <li className="text-xs text-slate-500">Sem dados</li>
              )}
            </ul>
          </div>
          <div className="space-y-3">
            <p className="text-sm font-semibold text-slate-900">Top 3 por produto</p>
            <ul className="space-y-2 rounded-lg border border-slate-200 bg-white p-3 text-sm">
              {data.searches.byProduct.slice(0, 3).map((item) => (
                <li key={item.product} className="flex items-center justify-between">
                  <span className="text-slate-700">{item.product || "N/A"}</span>
                  <span className="font-semibold text-slate-900">{item.total}</span>
                </li>
              ))}
              {data.searches.byProduct.length === 0 && (
                <li className="text-xs text-slate-500">Sem dados</li>
              )}
            </ul>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <LineChart title="Volume total de procura (por dia)" data={prepared.volumeLine} />
          <BarChart title="Horários de pico" data={prepared.peakHoursBars} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Aparições</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <StatCard label="Exibições totais" value={data.appearances.total} />
          <StatCard label="Leilão (1-3)" value={prepared.auctionTotal} />
          <StatCard label="Orgânicos (4-5)" value={prepared.organicTotal} />
          <StatCard label="Oferecido por" value={data.appearances.offered} />
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm font-semibold text-slate-900">Produto buscado</p>
          <ul className="mt-3 space-y-2 text-sm">
            {data.appearances.byProduct.map((item) => (
              <li key={item.product} className="flex items-center justify-between">
                <span className="text-slate-700">{item.product || "N/A"}</span>
                <span className="font-semibold text-slate-900">{item.total}</span>
              </li>
            ))}
            {data.appearances.byProduct.length === 0 && (
              <li className="text-xs text-slate-500">Sem dados</li>
            )}
          </ul>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Cliques e Contatos</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <StatCard label="Cliques/contatos" value={data.actions.totalClicks} />
          <StatCard label='Cliques em "Ligar"' value={data.actions.calls} />
          <StatCard label="Cliques no WhatsApp" value={data.actions.whatsapp} />
          <StatCard label="Taxa de ação (CTR)" value={`${(data.actions.ctr * 100).toFixed(1)}%`} />
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold text-slate-900">Origem dos Contatos</p>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <StatCard label="Ligações" value={data.origins?.calls ?? 0} />
              <StatCard label="WhatsApp" value={data.origins?.whatsapp ?? 0} />
              <StatCard label="Web" value={data.origins?.web ?? 0} />
              <StatCard label="Total" value={data.actions.totalClicks ?? 0} />
            </div>
            <div className="space-y-2">
              {[
                { label: "Ligações", value: data.origins?.calls ?? 0, tone: "bg-slate-900" },
                { label: "WhatsApp", value: data.origins?.whatsapp ?? 0, tone: "bg-emerald-600" },
                { label: "Web", value: data.origins?.web ?? 0, tone: "bg-indigo-600" },
              ].map((item) => {
                const max = Math.max(
                  data.origins?.calls ?? 0,
                  data.origins?.whatsapp ?? 0,
                  data.origins?.web ?? 0,
                  1
                );
                return (
                  <div key={item.label}>
                    <div className="flex items-center justify-between text-xs text-slate-600">
                      <span>{item.label}</span>
                      <span className="font-semibold text-slate-900">{item.value}</span>
                    </div>
                    <div className="mt-1 h-2 w-full rounded-full bg-slate-100">
                      <div
                        className={`h-2 rounded-full ${item.tone}`}
                        style={{ width: `${(item.value / max) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <BarChart title="Chamadas por horário" data={prepared.clicksByHourBars} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Custos e Rendimento</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <StatCard label="Gastos em leilões" value={formatCurrency(data.costs.totalSpent)} />
          <StatCard
            label="Custo por aparição"
            value={formatCurrency(data.costs.costPerAppearance)}
          />
          <StatCard label="Custo por clique" value={formatCurrency(data.costs.costPerClick)} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Retorno e Desempenho</h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SimpleTable
            title="Retorno por nicho"
            columns={["Nicho", "Valor"]}
            rows={data.performance.byNiche.map((item) => [
              item.niche || "N/A",
              item.value.toFixed(2),
            ])}
          />
          <SimpleTable
            title="Retorno por produto"
            columns={["Produto", "Valor"]}
            rows={data.performance.byProduct.map((item) => [
              item.product || "N/A",
              item.value.toFixed(2),
            ])}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SimpleTable
            title="Desempenho por horário"
            columns={["Hora", "Valor"]}
            rows={data.performance.byHour.map((item) => [`${item.hour}h`, item.value.toFixed(2)])}
          />
          <LineChart title="Desempenho por dia" data={prepared.performanceByDayLine} />
        </div>
      </section>
    </div>
  );
};

const Overlay = ({ children }: { children: React.ReactNode }) => (
  <div className="fixed inset-0 z-20 grid place-items-center bg-black/40 px-4">
    <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-lg">{children}</div>
  </div>
);

type ProductFormState = {
  nome: string;
  descricao: string;
  preco: number;
  status: "ativo" | "inativo";
};

type ProductModalProps = {
  open: boolean;
  title: string;
  submitLabel: string;
  initial?: ProductFormState;
  onClose: () => void;
  onSubmit: (data: ProductFormState) => Promise<void> | void;
};

const ProductModal = ({
  open,
  title,
  submitLabel,
  initial,
  onClose,
  onSubmit,
}: ProductModalProps) => {
  const [nome, setNome] = useState(initial?.nome ?? "");
  const [descricao, setDescricao] = useState(initial?.descricao ?? "");
  const [preco, setPreco] = useState<number>(initial?.preco ?? 0);
  const [status, setStatus] = useState<"ativo" | "inativo">(initial?.status ?? "ativo");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (initial) {
      setNome(initial.nome ?? "");
      setDescricao(initial.descricao ?? "");
      setPreco(initial.preco ?? 0);
      setStatus(initial.status ?? "ativo");
    }
  }, [initial]);

  if (!open) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit({
        nome: nome.trim(),
        descricao: descricao.trim(),
        preco: Math.max(0, Number(preco) || 0),
        status,
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Overlay>
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <p className="text-sm text-slate-600">Preencha os dados do produto.</p>
        </div>
        <button className="text-sm text-slate-500" onClick={onClose} type="button">
          Fechar
        </button>
      </div>
      <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
        <div>
          <label className="text-sm font-medium text-slate-800">Nome</label>
          <input
            className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-800">Descrição</label>
          <textarea
            className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            rows={3}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-slate-800">Preço</label>
            <input
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              type="number"
              min={0}
              step="0.01"
              value={preco}
              onChange={(e) => setPreco(Number(e.target.value))}
              required
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-800">Status</label>
            <select
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value === "ativo" ? "ativo" : "inativo")}
            >
              <option value="ativo">Ativo</option>
              <option value="inativo">Inativo</option>
            </select>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            className="text-sm text-slate-600"
            onClick={onClose}
            disabled={submitting}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            disabled={submitting}
          >
            {submitting ? "Salvando..." : submitLabel}
          </button>
        </div>
      </form>
    </Overlay>
  );
};

export const ProductsPanelPage = () => {
  const { products, loading, error, refetch, createProduct, updateProduct } = useProducts();
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  const handleToggleStatus = async (product: Product) => {
    await updateProduct(product.id, {
      nome: product.nome,
      descricao: product.descricao,
      preco: product.preco,
      status: product.status === "ativo" ? "inativo" : "ativo",
    });
  };

  const handleCreate = async (payload: ProductFormState) => {
    await createProduct({
      nome: payload.nome,
      descricao: payload.descricao,
      preco: payload.preco,
    });
    refetch();
  };

  const handleUpdate = async (payload: ProductFormState) => {
    if (!editing) return;
    await updateProduct(editing.id, payload);
    refetch();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Produtos</h1>
          <p className="text-sm text-slate-600">
            Cadastre e gerencie os produtos da sua empresa.
          </p>
        </div>
        <button
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          onClick={() => {
            setEditing(null);
            setCreateOpen(true);
          }}
          type="button"
        >
          Novo produto
        </button>
      </div>

      {loading && <p className="text-sm text-slate-600">Carregando produtos...</p>}
      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Não foi possível carregar produtos.
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Nome</th>
              <th className="px-3 py-2">Preço</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Aparições</th>
              <th className="px-3 py-2">Cliques</th>
              <th className="px-3 py-2">CTR</th>
              <th className="px-3 py-2">Ações</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-sm text-slate-600" colSpan={7}>
                  Nenhum produto cadastrado.
                </td>
              </tr>
            ) : (
              products.map((product) => (
                <tr key={product.id} className="border-t border-slate-100">
                  <td className="px-3 py-3 font-medium text-slate-900">{product.nome || "N/A"}</td>
                  <td className="px-3 py-3 text-slate-800">
                    {formatCurrency(product.preco ?? 0)}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${
                        product.status === "ativo"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {product.status === "ativo" ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-slate-800">{product.aparicoes ?? 0}</td>
                  <td className="px-3 py-3 text-slate-800">{product.cliques ?? 0}</td>
                  <td className="px-3 py-3 text-slate-800">
                    {((product.ctr ?? 0) * 100).toFixed(1)}%
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="text-sm font-semibold text-slate-800"
                        onClick={() => {
                          setEditing(product);
                          setCreateOpen(false);
                        }}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="text-sm font-semibold text-slate-800"
                        onClick={() => handleToggleStatus(product)}
                      >
                        {product.status === "ativo" ? "Desativar" : "Ativar"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ProductModal
        open={isCreateOpen}
        title="Novo produto"
        submitLabel="Criar produto"
        initial={{ nome: "", descricao: "", preco: 0, status: "ativo" }}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
      />

      <ProductModal
        open={Boolean(editing)}
        title="Editar produto"
        submitLabel="Salvar alterações"
        initial={
          editing
            ? {
                nome: editing.nome ?? "",
                descricao: editing.descricao ?? "",
                preco: editing.preco ?? 0,
                status: editing.status ?? "inativo",
              }
            : undefined
        }
        onClose={() => setEditing(null)}
        onSubmit={handleUpdate}
      />
    </div>
  );
};

export const NichesPanelPage = () => {
  const { niches, loading, error, toggleStatus } = useNiches();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Nichos</h1>
        <p className="text-sm text-slate-600">
          Gerencie os nichos associados à sua empresa e acompanhe métricas.
        </p>
      </div>

      {loading && <p className="text-sm text-slate-600">Carregando nichos...</p>}
      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Não foi possível carregar os nichos.
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Nome</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Buscas</th>
              <th className="px-3 py-2">Aparições</th>
              <th className="px-3 py-2">Cliques</th>
              <th className="px-3 py-2">CTR</th>
              <th className="px-3 py-2">Custo</th>
              <th className="px-3 py-2">Ação</th>
            </tr>
          </thead>
          <tbody>
            {niches.length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-sm text-slate-600" colSpan={8}>
                  Nenhum nicho encontrado.
                </td>
              </tr>
            ) : (
              niches.map((niche: CompanyNiche) => (
                <tr key={niche.nicheId} className="border-t border-slate-100">
                  <td className="px-3 py-3 font-medium text-slate-900">{niche.nome || "N/A"}</td>
                  <td className="px-3 py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${
                        niche.status === "ativo"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {niche.status === "ativo" ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-slate-800">{niche.buscas ?? 0}</td>
                  <td className="px-3 py-3 text-slate-800">{niche.aparicoes ?? 0}</td>
                  <td className="px-3 py-3 text-slate-800">{niche.cliques ?? 0}</td>
                  <td className="px-3 py-3 text-slate-800">{((niche.ctr ?? 0) * 100).toFixed(1)}%</td>
                  <td className="px-3 py-3 text-slate-800">{formatCurrency(niche.custo ?? 0)}</td>
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      className="text-sm font-semibold text-slate-800"
                      onClick={() => toggleStatus(niche)}
                    >
                      {niche.status === "ativo" ? "Desativar" : "Ativar"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

type PlanCardProps = {
  title: string;
  price: number;
  onClick: () => void;
};

const PlanCard = ({ title, price, onClick }: PlanCardProps) => (
  <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
    <p className="text-sm font-semibold text-slate-900">{title}</p>
    <p className="mt-1 text-2xl font-bold text-slate-900">R$ {price}</p>
    <button
      type="button"
      className="mt-3 w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
      onClick={onClick}
    >
      Comprar
    </button>
  </div>
);

const formatDate = (value: string) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

export const AuctionPanelPage = () => {
  const {
    companies,
    isLoading: companiesLoading,
    selectedCompanyId,
    setSelectedCompanyId,
  } = useCompanySelection();
  const { wallet, transactions, loading, error, buy, refetch } = useAuction(selectedCompanyId);

  const plans = [
    { title: "Pacote 10 créditos", price: 10, code: "10" },
    { title: "Pacote 25 créditos", price: 25, code: "25" },
    { title: "Pacote 50 créditos", price: 50, code: "50" },
    { title: "Pacote 100 créditos", price: 100, code: "100" },
  ];

  return (
    <div className="space-y-4">
      <CompanySelector
        companies={companies}
        isLoading={companiesLoading}
        value={selectedCompanyId}
        onChange={setSelectedCompanyId}
        label="Empresa"
      />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Leilão</h1>
          <p className="text-sm text-slate-600">
            Acompanhe saldo, extrato e compre créditos para participar dos leilões.
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Saldo atual</p>
          <p className="text-2xl font-semibold text-slate-900">{wallet.saldo ?? 0} créditos</p>
        </div>
      </div>

      {loading && <p className="text-sm text-slate-600">Carregando dados...</p>}
      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Não foi possível carregar saldo ou extrato.
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        {plans.map((plan) => (
          <PlanCard
            key={plan.code}
            title={plan.title}
            price={plan.price}
            onClick={async () => {
              await buy(plan.code);
              refetch();
            }}
          />
        ))}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <p className="text-sm font-semibold text-slate-900">Extrato</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Data</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Valor</th>
                <th className="px-3 py-2">Descrição</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-sm text-slate-600" colSpan={4}>
                    Nenhuma transação encontrada.
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => (
                  <tr key={tx.id} className="border-t border-slate-100">
                    <td className="px-3 py-3 text-slate-800">{formatDate(tx.data)}</td>
                    <td className="px-3 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${
                          tx.tipo === "credito"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-rose-50 text-rose-700"
                        }`}
                      >
                        {tx.tipo === "credito" ? "Crédito" : "Débito"}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-semibold text-slate-900">
                      {tx.tipo === "debito" ? "-" : "+"}R$ {tx.valor.toFixed(2)}
                    </td>
                    <td className="px-3 py-3 text-slate-800">{tx.descricao || "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
