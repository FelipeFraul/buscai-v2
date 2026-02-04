import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { fetchDashboardAnalytics } from "@/features/dashboard/api";
import {
  adaptDashboardToLegacyShape,
  type LegacyDashboardResponse,
} from "@/lib/analyticsAdapter";
import { apiClient } from "@/lib/api/client";
import { formatCurrencyFromCents } from "@/lib/utils";
import { useMeCompany } from "./useMeCompany";
import type { PaginatedProductOffers } from "@buscai/shared-schema";

type ProductPlan = {
  id: string;
  name: string;
  description?: string | null;
  monthlyPriceCents: number;
  maxActiveOffers: number;
  isActive?: boolean;
};

type ProductSubscriptionResponse = {
  plan: ProductPlan | null;
  status: "active" | "inactive" | "cancelled" | null;
};

const formatRemaining = (ms: number) => {
  if (ms <= 0) return "Expirada nas buscas";
  const totalMinutes = Math.floor(ms / (1000 * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return `Expira em ${hours}h ${minutes}min`;
  }
  return `Expira em ${minutes} min`;
};

export const ProductsPage = () => {
  const meCompany = useMeCompany();
  const companyId = meCompany.data?.company?.id;
  const companyParams = companyId ? { params: { companyId } } : undefined;

  const subscriptionQuery = useQuery<ProductSubscriptionResponse>({
    queryKey: ["product-subscription", companyId ?? "none"],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const res = await apiClient.get<ProductSubscriptionResponse>(
        "/products/subscription",
        companyParams
      );
      return res.data;
    },
  });

  const productsQuery = useQuery<PaginatedProductOffers>({
    queryKey: ["owner-products-overview", companyId ?? "none"],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const res = await apiClient.get<PaginatedProductOffers>("/products", companyParams);
      return res.data;
    },
  });

  const analyticsQuery = useQuery<LegacyDashboardResponse>({
    queryKey: ["analytics-dashboard", "legacy", meCompany.data?.company?.id ?? "none"],
    enabled: Boolean(meCompany.data?.company?.id),
    queryFn: async () => {
      const data = await fetchDashboardAnalytics(meCompany.data?.company?.id);
      return adaptDashboardToLegacyShape(data);
    },
  });

  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const products = productsQuery.data?.items ?? [];
  const productsWithTimers = useMemo(() => {
    return products.map((product) => {
      const createdAt = product.createdAt ? new Date(product.createdAt).getTime() : 0;
      const expiresAt = createdAt ? createdAt + 24 * 60 * 60 * 1000 : 0;
      const remainingMs = expiresAt - nowTick;
      return { ...product, expiresAt, remainingMs };
    });
  }, [products, nowTick]);

  const activeOffersFromMe = meCompany.data?.products?.activeOffers ?? 0;
  const activePlanLimit = subscriptionQuery.data?.plan?.maxActiveOffers ?? null;
  const totals = analyticsQuery.data?.totals ?? {
    impressions: 0,
    contacts: 0,
    totalCostCents: 0,
    costPerContactCents: 0,
  };

  const offersExpiringSoon = productsWithTimers.filter(
    (p) => p.isActive !== false && p.remainingMs > 0 && p.remainingMs <= 3 * 60 * 60 * 1000
  );

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Produtos – Resultado do momento</h1>
            <p className="text-sm text-slate-600">
              Veja como suas ofertas de produtos estão performando nas buscas do BUSCAI.
            </p>
          </div>
          <Button asChild>
            <Link to="/configuracoes/produtos">Ir para gestão de produtos</Link>
          </Button>
        </div>
      </header>

      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
        <p className="font-semibold text-slate-900">Regras das ofertas</p>
        <p className="text-sm text-slate-700">
          Cada produto fica disponível nas buscas por até 24 horas após ser ativado. Depois desse prazo, ele deixa de aparecer até ser renovado. Reclamações de clientes podem gerar penalidades na visibilidade.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Ofertas ativas (empresa)</p>
          <p className="text-2xl font-bold text-slate-900">{activeOffersFromMe}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Limite do plano</p>
          <p className="text-2xl font-bold text-slate-900">
            {activePlanLimit ? `${activePlanLimit} produtos` : "Nenhum plano"}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Ofertas cadastradas</p>
          <p className="text-2xl font-bold text-slate-900">{products.length}</p>
        </Card>
      </div>

      {offersExpiringSoon.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Você tem ofertas que expiram nas próximas 3 horas. Renove-as na gestão de produtos para mantê-las nas buscas.
        </div>
      ) : null}

      <section className="grid gap-3 md:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Impressões (dashboard)</p>
          <p className="text-2xl font-bold text-slate-900">
            {(totals.impressions ?? 0).toLocaleString("pt-BR")}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Contatos (dashboard)</p>
          <p className="text-2xl font-bold text-slate-900">
            {(totals.contacts ?? 0).toLocaleString("pt-BR")}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Custo total (dashboard)</p>
          <p className="text-2xl font-bold text-slate-900">
            {formatCurrencyFromCents(totals.totalCostCents)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Custo por contato (dashboard)</p>
          <p className="text-2xl font-bold text-slate-900">
            {formatCurrencyFromCents(totals.costPerContactCents)}
          </p>
        </Card>
      </section>

      <Card className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">Ofertas atuais</p>
            <p className="text-xs text-slate-600">
              Lista resumida das suas ofertas. Para editar, acesse a gestão de produtos.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link to="/configuracoes/produtos">Abrir gestão de produtos</Link>
          </Button>
        </div>
        {productsQuery.isLoading ? (
          <Card className="bg-slate-50 text-sm text-slate-600">Carregando ofertas...</Card>
        ) : productsQuery.isError ? (
          <Card className="space-y-2 border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p>Não foi possível carregar as ofertas. Tente novamente mais tarde.</p>
          </Card>
        ) : products.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">
            Nenhuma oferta cadastrada ainda.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Produto</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Preço</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Status</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Validade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {productsWithTimers.slice(0, 10).map((product) => (
                  <tr key={product.id}>
                    <td className="px-3 py-3">
                      <p className="font-semibold text-slate-900">{product.title}</p>
                      {product.description ? (
                        <p className="text-xs text-slate-600">{product.description}</p>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      <div className="space-y-0.5">
                        {product.originalPriceCents ? (
                          <p className="text-xs text-slate-500 line-through">
                            {formatCurrencyFromCents(product.originalPriceCents)}
                          </p>
                        ) : null}
                        <p className="text-sm font-semibold text-slate-900">
                          {formatCurrencyFromCents(product.priceCents)}
                        </p>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          product.isActive === false
                            ? "border border-slate-200 bg-slate-100 text-slate-700"
                            : "border border-emerald-200 bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        {product.isActive === false ? "Inativo" : "Ativo"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-sm text-slate-700">
                      {product.isActive === false ? (
                        <span className="text-slate-500">Desativado</span>
                      ) : (
                        <span
                          className={
                            product.remainingMs <= 0
                              ? "text-amber-700"
                              : product.remainingMs <= 3 * 60 * 60 * 1000
                                ? "text-amber-600"
                                : "text-slate-700"
                          }
                        >
                          {product.createdAt ? formatRemaining(product.remainingMs) : "Sem data"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};
