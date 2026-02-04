import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { apiClient } from "@/lib/api/client";
import { queryClient } from "@/lib/api/queryClient";
import { formatCurrencyFromCents } from "@/lib/utils";
import { useMeCompany } from "./useMeCompany";
import type {
  PaginatedProductOffers,
  ProductOffer,
  ProductOfferCreateInput,
  ProductOfferUpdateInput,
} from "@buscai/shared-schema";

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

type ProductFormMode = "create" | "edit";

type ProductFormModalProps = {
  mode: ProductFormMode;
  productId?: string | null;
  onClose: () => void;
  companyData?: ReturnType<typeof useMeCompany>["data"];
  companyLoading?: boolean;
  companyError?: unknown;
};

const toPriceString = (value?: number | null) =>
  value === undefined || value === null ? "" : (value / 100).toFixed(2);

const parsePriceToCents = (value: string) => {
  const normalized = value.replace(",", ".");
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.round(numeric * 100);
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

const ProductFormModal = ({
  mode,
  productId,
  onClose,
  companyData,
  companyLoading,
  companyError,
}: ProductFormModalProps) => {
  const isEdit = mode === "edit";
  const companyId = companyData?.company?.id;
  const companyParams = companyId ? { params: { companyId } } : undefined;

  const productQuery = useQuery<ProductOffer>({
    queryKey: ["owner-product", productId],
    enabled: isEdit && Boolean(productId),
    queryFn: async () => {
      const res = await apiClient.get<ProductOffer>(`/products/${productId}`, companyParams);
      return res.data;
    },
  });

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [originalPrice, setOriginalPrice] = useState("");
  const [nicheId, setNicheId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const niches = companyData?.company?.niches ?? [];
  const city = companyData?.company?.city;
  const companyCityLabel = city ? `${city.name} / ${city.state}` : "Cidade não configurada";

  useEffect(() => {
    if (!isEdit) {
      setTitle("");
      setDescription("");
      setPrice("");
      setOriginalPrice("");
      setNicheId("");
      setError(null);
      return;
    }
    if (!productQuery.data) {
      setTitle("");
      setDescription("");
      setPrice("");
      setOriginalPrice("");
      setNicheId("");
      setError(null);
    }
    if (productQuery.data) {
      setTitle(productQuery.data.title ?? "");
      setDescription(productQuery.data.description ?? "");
      setPrice(toPriceString(productQuery.data.priceCents));
      setOriginalPrice(toPriceString(productQuery.data.originalPriceCents));
      setNicheId(productQuery.data.nicheId ?? "");
      setError(null);
    }
  }, [isEdit, productQuery.data]);

  useEffect(() => {
    if (!isEdit && niches.length === 1) {
      setNicheId(niches[0]?.id ?? "");
    }
  }, [isEdit, niches]);

  const createProduct = useMutation<ProductOffer, unknown, ProductOfferCreateInput>({
    mutationFn: async (payload) => {
      const res = await apiClient.post<ProductOffer>("/products", payload, companyParams);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["owner-products", companyId ?? "none"] });
      onClose();
    },
    onError: () => {
      setError("Não foi possível salvar o produto. Verifique os dados e tente novamente.");
    },
  });

  const updateProduct = useMutation<ProductOffer, unknown, ProductOfferUpdateInput & { id: string }>({
    mutationFn: async (payload) => {
      const { id, ...body } = payload;
      const res = await apiClient.put<ProductOffer>(`/products/${id}`, body, companyParams);
      return res.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["owner-products", companyId ?? "none"] });
      queryClient.invalidateQueries({ queryKey: ["owner-product", variables.id] });
      onClose();
    },
    onError: () => {
      setError("Não foi possível atualizar o produto.");
    },
  });

  const isSaving = createProduct.isPending || updateProduct.isPending;

  const handleSubmit = () => {
    setError(null);
    if (companyLoading) {
      setError("Carregando dados da empresa...");
      return;
    }
    if (companyError) {
      setError("Não foi possível carregar os dados da empresa. Tente novamente mais tarde.");
      return;
    }
    if (!city?.id) {
      setError(
        "Configure a cidade da sua empresa em Configurações > Minha empresa antes de cadastrar produtos."
      );
      return;
    }
    if (!niches.length) {
      setError("Configure pelo menos um nicho para sua empresa antes de cadastrar produtos.");
      return;
    }
    if (!title.trim()) {
      setError("Informe um título para o produto.");
      return;
    }
    const priceCents = parsePriceToCents(price);
    if (priceCents === null) {
      setError("Informe um preço válido maior que zero.");
      return;
    }
    const originalInput = originalPrice.trim();
    const originalPriceCents =
      originalInput === ""
        ? null
        : parsePriceToCents(originalPrice);
    if (originalInput !== "" && originalPriceCents === null) {
      setError("Preço original inválido.");
      return;
    }

    if (!nicheId) {
      setError("Selecione um nicho.");
      return;
    }

    if (isEdit) {
      if (!productId) {
        setError("Produto inválido.");
        return;
      }
      updateProduct.mutate({
        id: productId,
        title: title.trim(),
        description: description.trim(),
        priceCents,
        originalPriceCents,
      });
      return;
    }

    createProduct.mutate({
      cityId: city.id,
      nicheId,
      title: title.trim(),
      description: description.trim(),
      priceCents,
      originalPriceCents,
    });
  };

  const cannotSubmit =
    isSaving || companyLoading || !city?.id || niches.length === 0;

  if (isEdit && productQuery.isLoading) {
    return (
      <div className="fixed inset-0 z-30 grid place-items-center bg-slate-900/40 px-4 backdrop-blur-sm">
        <Card className="w-full max-w-xl">Carregando produto...</Card>
      </div>
    );
  }

  if (isEdit && productQuery.isError) {
    return (
      <div className="fixed inset-0 z-30 grid place-items-center bg-slate-900/40 px-4 backdrop-blur-sm">
        <Card className="w-full max-w-xl space-y-3">
          <p className="text-sm text-slate-700">Não foi possível carregar este produto.</p>
          <div className="flex justify-end">
            <Button onClick={onClose}>Fechar</Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-30 grid place-items-center bg-slate-900/40 px-4 backdrop-blur-sm">
      <div className="w-full max-w-xl space-y-4 rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              {isEdit ? "Editar produto" : "Novo produto"}
            </h3>
            <p className="text-sm text-slate-600">
              {isEdit
                ? "Atualize os dados do produto listado."
                : "Cadastre um produto que aparecerá nas buscas."}
            </p>
            {!isEdit ? (
              <p className="text-xs text-slate-500">
                Essa oferta ficará ativa nas buscas por até 24 horas a partir da criação. Você poderá renová-la depois.
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-3 py-1 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
          >
            Fechar
          </button>
        </div>

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Título</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nome do produto" />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Descrição (opcional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              rows={3}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Preço da oferta (R$)</label>
              <Input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="Ex.: 79,90"
                type="number"
                min="0"
                step="0.01"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Preço original (opcional)</label>
              <Input
                value={originalPrice}
                onChange={(e) => setOriginalPrice(e.target.value)}
                placeholder="Ex.: 99,90"
                type="number"
                min="0"
                step="0.01"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Cidade</label>
              <div className="h-10 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-800 shadow-sm">
                <div className="flex h-full items-center">
                  {companyLoading
                    ? "Carregando..."
                    : companyError
                      ? "Erro ao carregar cidade"
                      : companyCityLabel}
                </div>
              </div>
              {!city?.id ? (
                <p className="text-xs text-amber-700">
                  Configure a cidade da sua empresa em Configurações &gt; Minha empresa.
                </p>
              ) : null}
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Nicho</label>
              {niches.length === 0 ? (
                <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  Configure pelo menos um nicho para sua empresa.
                </div>
              ) : (
                <select
                  className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  value={nicheId}
                  onChange={(e) => setNicheId(e.target.value)}
                  disabled={companyLoading}
                >
                  {niches.length > 1 ? <option value="">Selecione um nicho</option> : null}
                  {niches.map((niche) => (
                    <option key={niche.id} value={niche.id}>
                      {niche.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          {createProduct.error || updateProduct.error ? (
            <p className="text-sm text-rose-600">Erro ao salvar produto.</p>
          ) : null}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={isSaving}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={cannotSubmit}>
            {isSaving ? "Salvando..." : isEdit ? "Salvar alterações" : "Criar produto"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export const ProductsManagementPage = () => {
  const meCompany = useMeCompany();
  const companyId = meCompany.data?.company?.id;
  const companyParams = companyId ? { params: { companyId } } : undefined;
  const plansQuery = useQuery<ProductPlan[]>({
    queryKey: ["product-plans"],
    queryFn: async () => {
      const res = await apiClient.get<ProductPlan[]>("/products/plans");
      return res.data;
    },
  });

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
    queryKey: ["owner-products", companyId ?? "none"],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const res = await apiClient.get<PaginatedProductOffers>("/products", companyParams);
      return res.data;
    },
  });

  const deactivateProduct = useMutation<void, unknown, string>({
    mutationFn: async (productId) => {
      await apiClient.delete(`/products/${productId}`, companyParams);
    },
    onSuccess: (_data, productId) => {
      queryClient.invalidateQueries({ queryKey: ["owner-products", companyId ?? "none"] });
      queryClient.invalidateQueries({ queryKey: ["owner-product", productId] });
    },
  });

  const changePlanMutation = useMutation({
    mutationFn: async (planId: string) => {
      const res = await apiClient.post("/products/subscription", { planId }, companyParams);
      return res.data;
    },
    onSuccess: () => {
      subscriptionQuery.refetch();
      meCompany.refetch();
    },
  });

  const renewOfferMutation = useMutation({
    mutationFn: async (productId: string) => {
      const res = await apiClient.post(`/products/${productId}/renew`, null, companyParams);
      return res.data;
    },
    onSuccess: () => {
      productsQuery.refetch();
    },
  });

  const [nowTick, setNowTick] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setNowTick(Date.now());
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  const products = productsQuery.data?.items ?? [];
  const activeCount = useMemo(
    () => products.filter((item) => item.isActive !== false).length,
    [products]
  );
  const activePlan = subscriptionQuery.data?.plan ?? null;
  const activePlanLimit = activePlan?.maxActiveOffers ?? null;
  const activeOffersFromMe = meCompany.data?.products?.activeOffers ?? 0;
  const productsWithTimers = useMemo(() => {
    return products.map((product) => {
      const createdAt = product.createdAt ? new Date(product.createdAt).getTime() : 0;
      const expiresAt = createdAt ? createdAt + 24 * 60 * 60 * 1000 : 0;
      const remainingMs = expiresAt - nowTick;
      return { ...product, expiresAt, remainingMs };
    });
  }, [products, nowTick]);
  const hasExpiringSoon = productsWithTimers.some(
    (p) => p.isActive !== false && p.remainingMs > 0 && p.remainingMs <= 3 * 60 * 60 * 1000
  );

  const [formMode, setFormMode] = useState<ProductFormMode | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const openCreate = () => {
    setEditingId(null);
    setFormMode("create");
  };

  const openEdit = (id: string) => {
    setEditingId(id);
    setFormMode("edit");
  };

  const handleDeactivate = (id: string) => {
    if (!window.confirm("Desativar este produto? Ele deixará de aparecer nas buscas.")) {
      return;
    }
    deactivateProduct.mutate(id);
  };

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-slate-900">Gestão de produtos</h1>
        <p className="text-sm text-slate-600">
          Gerencie os produtos exibidos nas buscas do BUSCAI.
        </p>
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

      <Card className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">
              Plano atual: {activePlanLimit ? `${activePlanLimit} produtos ativos` : "Nenhum plano"}
            </p>
            <p className="text-xs text-slate-600">
              Produtos ativos: {activeOffersFromMe}
              {activePlanLimit ? ` / ${activePlanLimit}` : ""}
            </p>
          </div>
          {subscriptionQuery.isLoading || plansQuery.isLoading ? (
            <span className="text-xs text-slate-500">Carregando planos...</span>
          ) : null}
        </div>
        {subscriptionQuery.isError || plansQuery.isError ? (
          <p className="text-sm text-amber-700">
            Não foi possível carregar os planos agora. Tente novamente mais tarde.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {[1, 3, 7].map((maxOffers) => {
              const plan = plansQuery.data?.find((p) => p.maxActiveOffers === maxOffers);
              const isActivePlan =
                plan && subscriptionQuery.data?.status === "active" && plan.id === activePlan?.id;
              const buttonLabel =
                maxOffers === 1
                  ? "Começar com 1 produto"
                  : `Ativar ${maxOffers} produtos`;

              return (
                <div
                  key={maxOffers}
                  className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-slate-900">
                        {maxOffers} produto{maxOffers > 1 ? "s" : ""} por dia
                      </h3>
                      {isActivePlan ? (
                        <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">
                          Plano atual
                        </span>
                      ) : null}
                    </div>
                    <p className="text-sm text-slate-600">
                      {plan?.description ?? "Plano indisponível no momento."}
                    </p>
                    <p className="text-2xl font-bold text-slate-900">
                      {plan ? formatCurrencyFromCents(plan.monthlyPriceCents) : "--"}
                      <span className="text-sm font-medium text-slate-600"> / mês</span>
                    </p>
                    <p className="text-xs text-slate-500">
                      Até {maxOffers} ofertas ativas simultaneamente.
                    </p>
                  </div>
                  <Button
                    className="mt-4"
                    onClick={() => plan && changePlanMutation.mutate(plan.id)}
                    disabled={
                      !plan ||
                      isActivePlan ||
                      changePlanMutation.isPending ||
                      subscriptionQuery.isLoading
                    }
                  >
                    {isActivePlan
                      ? "Plano ativo"
                      : plan
                        ? buttonLabel
                        : "Plano indisponível"}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
        {changePlanMutation.isError ? (
          <p className="text-sm text-rose-700">
            Não foi possível ativar o plano. Tente novamente.
          </p>
        ) : null}
        {changePlanMutation.isSuccess ? (
          <p className="text-sm text-emerald-700">Plano atualizado com sucesso.</p>
        ) : null}
      </Card>

      {hasExpiringSoon ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Você tem ofertas que expiram nas próximas 3 horas. Use “Continuar oferta por +24h” para mantê-las nas buscas.
        </div>
      ) : null}

      <Card className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-900">
              Produtos ativos: {activeCount}
            </p>
            <p className="text-xs text-slate-600">
              Baseado na lista abaixo (isActive = true).
            </p>
          </div>
          <Button onClick={openCreate}>Novo produto</Button>
        </div>

        {productsQuery.isLoading ? (
          <Card className="bg-slate-50 text-sm text-slate-600">Carregando produtos...</Card>
        ) : productsQuery.isError ? (
          <Card className="space-y-2 border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p>Não foi possível carregar os produtos. Tente novamente mais tarde.</p>
            <Button size="sm" variant="outline" onClick={() => productsQuery.refetch()}>
              Tentar novamente
            </Button>
          </Card>
        ) : products.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
            <p className="text-sm text-slate-600">Nenhum produto cadastrado ainda.</p>
            <Button className="mt-3" onClick={openCreate}>
              Cadastrar primeiro produto
            </Button>
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
                  <th className="px-3 py-2 text-right font-semibold text-slate-600">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {productsWithTimers.map((product) => (
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
                    <td className="px-3 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => openEdit(product.id)}>
                          Editar
                        </Button>
                        {product.isActive === false ? null : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeactivate(product.id)}
                            disabled={deactivateProduct.isPending}
                          >
                            Desativar
                          </Button>
                        )}
                        {product.isActive !== false ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => renewOfferMutation.mutate(product.id)}
                            disabled={
                              renewOfferMutation.isPending ||
                              (product.remainingMs > 3 * 60 * 60 * 1000 &&
                                product.remainingMs > 0)
                            }
                          >
                            Continuar oferta por +24h
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {renewOfferMutation.isError ? (
          <p className="text-sm text-rose-700">Não foi possível renovar a oferta. Verifique seu plano e tente novamente.</p>
        ) : null}
        {renewOfferMutation.isSuccess ? (
          <p className="text-sm text-emerald-700">Oferta renovada por mais 24h.</p>
        ) : null}
      </Card>

      {formMode ? (
        <ProductFormModal
          mode={formMode}
          productId={editingId}
          onClose={() => setFormMode(null)}
          companyData={meCompany.data}
          companyLoading={meCompany.isLoading}
          companyError={meCompany.error}
        />
      ) : null}
    </div>
  );
};
