import { useState } from "react";

type Step3ProductsProps = {
  onNext: () => void;
};

type ProductDraft = { nome: string; preco: number };

const STORAGE_KEY = "onb_products";
const DEFAULT_PRODUCTS: ProductDraft[] = [
  { nome: "Serviço padrão", preco: 0 },
  { nome: "Produto padrão", preco: 0 },
];

export const Step3Products = ({ onNext }: Step3ProductsProps) => {
  const stored = localStorage.getItem(STORAGE_KEY);
  const parsed = stored ? (JSON.parse(stored) as ProductDraft[]) : DEFAULT_PRODUCTS;
  const [products, setProducts] = useState<ProductDraft[]>(parsed);

  const updateProduct = (index: number, field: keyof ProductDraft, value: string) => {
    setProducts((prev) =>
      prev.map((item, idx) =>
        idx === index
          ? { ...item, [field]: field === "preco" ? Math.max(0, Number(value) || 0) : value }
          : item
      )
    );
  };

  const handleNext = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
    onNext();
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-700">Revise ou edite os produtos iniciais.</p>
      <div className="space-y-3">
        {products.map((product, index) => (
          <div key={index} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-slate-700">Nome</label>
                <input
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  value={product.nome}
                  onChange={(e) => updateProduct(index, "nome", e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-700">Preço</label>
                <input
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  type="number"
                  min={0}
                  step="0.01"
                  value={product.preco}
                  onChange={(e) => updateProduct(index, "preco", e.target.value)}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          onClick={handleNext}
        >
          Criar automaticamente e continuar
        </button>
      </div>
    </div>
  );
};
