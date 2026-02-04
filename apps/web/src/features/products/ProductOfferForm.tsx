import { useMemo, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useCities, useNiches } from "@/features/catalog/useCatalog";
import type { components } from "@/lib/api/types";

import { useSaveProductOffer } from "./useProductOffers";

type ProductOffer = components["schemas"]["ProductOffer"];

type ProductOfferFormProps = {
  companyId: string;
  offer?: ProductOffer;
  onClose: () => void;
};

export const ProductOfferForm = ({
  companyId,
  offer,
  onClose,
}: ProductOfferFormProps) => {
  const isEditing = Boolean(offer);
  const [title, setTitle] = useState(() => offer?.title ?? "");
  const [description, setDescription] = useState(() => offer?.description ?? "");
  const [cityId, setCityId] = useState(() => offer?.cityId ?? "");
  const [nicheId, setNicheId] = useState(() => offer?.nicheId ?? "");
  const [price, setPrice] = useState(() =>
    offer?.priceCents !== undefined ? (offer.priceCents / 100).toString() : ""
  );
  const [originalPrice, setOriginalPrice] = useState(() =>
    offer?.originalPriceCents !== undefined && offer?.originalPriceCents !== null
      ? (offer.originalPriceCents / 100).toString()
      : ""
  );
  const [isActive, setIsActive] = useState(() => offer?.isActive ?? true);

  const citiesQuery = useCities();
  const nichesQuery = useNiches();
  const saveOffer = useSaveProductOffer();

  const cityOptions = useMemo(() => citiesQuery.data ?? [], [citiesQuery.data]);
  const nicheOptions = useMemo(() => nichesQuery.data ?? [], [nichesQuery.data]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!title || !description || !cityId || !nicheId || !price) {
      return;
    }

    const priceCents = Math.round(Number(price) * 100);
    if (Number.isNaN(priceCents) || priceCents <= 0) {
      return;
    }

    const normalizedOriginalPrice = originalPrice.trim();
    const originalPriceCents =
      normalizedOriginalPrice === ""
        ? offer
          ? null
          : undefined
        : Math.round(Number(normalizedOriginalPrice) * 100);

    const basePayload = {
      cityId,
      nicheId,
      title,
      description,
      priceCents,
      originalPriceCents,
      isActive,
    };

    if (offer) {
      if (!offer.id) {
        return;
      }
      saveOffer.mutate(
        {
          companyId,
          offerId: offer.id,
          data: basePayload,
        },
        {
          onSuccess: onClose,
        }
      );
      return;
    }

    saveOffer.mutate(
      {
        companyId,
        data: basePayload,
      },
      {
        onSuccess: onClose,
      }
    );
  };

  return (
    <form
      className="space-y-4 rounded-lg border border-slate-200 p-4"
      onSubmit={handleSubmit}
    >
      <div className="flex items-center justify-between">
        <h4 className="text-base font-semibold text-slate-900">
          {isEditing ? "Editar oferta" : "Nova oferta"}
        </h4>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Fechar
        </Button>
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-700" htmlFor="title">
          Titulo
        </label>
        <Input
          id="title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          required
        />
      </div>

      <div className="space-y-1">
        <label
          className="text-sm font-medium text-slate-700"
          htmlFor="description"
        >
          Descricao
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className="min-h-[120px] w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          required
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700" htmlFor="city">
            Cidade
          </label>
          <select
            id="city"
            value={cityId}
            onChange={(event) => setCityId(event.target.value)}
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
            required
          >
            <option value="">Selecione</option>
            {cityOptions.map((city) => (
              <option key={city.id} value={city.id}>
                {city.name} - {city.state}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700" htmlFor="niche">
            Nicho
          </label>
          <select
            id="niche"
            value={nicheId}
            onChange={(event) => setNicheId(event.target.value)}
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
            required
          >
            <option value="">Selecione</option>
            {nicheOptions.map((niche) => (
              <option key={niche.id} value={niche.id}>
                {niche.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700" htmlFor="price">
            Preco (R$)
          </label>
          <Input
            id="price"
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            required
          />
        </div>
        <div className="space-y-1">
          <label
            className="text-sm font-medium text-slate-700"
            htmlFor="originalPrice"
          >
            Preco original (opcional)
          </label>
          <Input
            id="originalPrice"
            type="number"
            min="0"
            step="0.01"
            value={originalPrice}
            onChange={(event) => setOriginalPrice(event.target.value)}
          />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
            />
            Oferta ativa
          </label>
        </div>
      </div>

      {saveOffer.error ? (
        <p className="text-sm text-rose-600">
          Nao foi possivel salvar a oferta. Tente novamente.
        </p>
      ) : null}

      <div className="flex justify-end gap-3">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={saveOffer.isPending}>
          {saveOffer.isPending
            ? "Salvando..."
            : isEditing
            ? "Atualizar oferta"
            : "Criar oferta"}
        </Button>
      </div>
    </form>
  );
};
