import { useMemo, useState } from "react";

import { Button } from "@/components/ui/Button";
import type { components } from "@/lib/api/types";

import { ProductOfferForm } from "./ProductOfferForm";
import { useProductOffers, useSaveProductOffer } from "./useProductOffers";

type ProductOffer = components["schemas"]["ProductOffer"];
type Subscription = components["schemas"]["Subscription"];

type ProductOffersListProps = {
  companyId?: string;
  subscription?: Subscription | null;
  isSubscriptionLoading?: boolean;
};

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export const ProductOffersList = ({
  companyId,
  subscription,
  isSubscriptionLoading,
}: ProductOffersListProps) => {
  const offersQuery = useProductOffers(companyId);
  const offers = useMemo(
    () => offersQuery.data?.items ?? [],
    [offersQuery.data]
  );
  const activeOffers = useMemo(
    () => offers.filter((offer) => offer.isActive !== false).length,
    [offers]
  );

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState<ProductOffer | undefined>();

  const saveOffer = useSaveProductOffer();

  const planLimit = subscription?.plan?.maxActiveOffers;
  const hasActiveSubscription = subscription?.status === "active";
  const canCreateMore =
    hasActiveSubscription &&
    (typeof planLimit !== "number" || activeOffers < planLimit);

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingOffer(undefined);
  };

  const handleEdit = (offer: ProductOffer) => {
    setEditingOffer(offer);
    setIsFormOpen(true);
  };

  const handleToggleActive = (offer: ProductOffer) => {
    if (!companyId) {
      return;
    }
    const companyKey = companyId;
    const offerKey = offer.id;
    if (!offerKey) {
      return;
    }
    saveOffer.mutate({
      companyId: companyKey,
      offerId: offerKey,
      data: { isActive: !(offer.isActive ?? true) },
    });
  };

  if (!companyId) {
    return (
      <p className="text-sm text-slate-500">
        Selecione uma empresa para gerenciar ofertas de produtos.
      </p>
    );
  }

  if (isSubscriptionLoading) {
    return <p className="text-sm text-slate-500">Carregando assinatura...</p>;
  }

  if (!hasActiveSubscription) {
    return (
      <p className="text-sm text-slate-500">
        Ative um plano de produtos para cadastrar ofertas.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">
            Ofertas cadastradas
          </h3>
          {typeof planLimit === "number" ? (
            <p className="text-sm text-slate-500">
              {activeOffers}/{planLimit} ofertas ativas neste plano.
            </p>
          ) : null}
        </div>
        <Button
          onClick={() => {
            setEditingOffer(undefined);
            setIsFormOpen(true);
          }}
          disabled={!canCreateMore}
        >
          Nova oferta
        </Button>
      </div>

      {offersQuery.isLoading ? (
        <p className="text-sm text-slate-500">Carregando ofertas...</p>
      ) : offers.length === 0 ? (
        <p className="text-sm text-slate-500">
          Nenhuma oferta encontrada para esta empresa.
        </p>
      ) : (
        <div className="overflow-hidden rounded-md border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-slate-600">
                  Titulo
                </th>
                <th className="px-3 py-2 text-left font-medium text-slate-600">
                  Cidade
                </th>
                <th className="px-3 py-2 text-left font-medium text-slate-600">
                  Nicho
                </th>
                <th className="px-3 py-2 text-left font-medium text-slate-600">
                  Preco
                </th>
                <th className="px-3 py-2 text-left font-medium text-slate-600">
                  Status
                </th>
                <th className="px-3 py-2 text-left font-medium text-slate-600">
                  Criado em
                </th>
                <th className="px-3 py-2 text-right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {offers.map((offer) => (
                <tr key={offer.id}>
                  <td className="px-3 py-2 font-medium text-slate-900">
                    {offer.title}
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    {offer.cityId}
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    {offer.nicheId}
                  </td>
                  <td className="px-3 py-2 text-slate-900">
                    {currency.format((offer.priceCents ?? 0) / 100)}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        offer.isActive
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {offer.isActive ? "Ativa" : "Inativa"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    {offer.createdAt
                      ? new Date(offer.createdAt).toLocaleDateString()
                      : "--"}
                  </td>
                  <td className="px-3 py-2 text-right space-x-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEdit(offer)}
                    >
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleToggleActive(offer)}
                      disabled={
                        saveOffer.isPending ||
                        (!offer.isActive &&
                          typeof planLimit === "number" &&
                          activeOffers >= planLimit)
                      }
                    >
                      {offer.isActive ? "Desativar" : "Ativar"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {saveOffer.error ? (
        <p className="text-sm text-rose-600">
          Nao foi possivel atualizar o status da oferta.
        </p>
      ) : null}

      {isFormOpen && companyId ? (
        <ProductOfferForm
          key={editingOffer?.id ?? "new"}
          companyId={companyId}
          offer={editingOffer}
          onClose={handleCloseForm}
        />
      ) : null}
    </div>
  );
};
