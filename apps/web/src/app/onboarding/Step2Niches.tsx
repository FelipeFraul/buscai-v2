import { useState } from "react";

type Step2NichesProps = {
  onNext: () => void;
};

const STORAGE_KEY = "onb_niches";
const SUGGESTED = ["Serviços Gerais", "Reformas", "Produtos para Casa"];

export const Step2Niches = ({ onNext }: Step2NichesProps) => {
  const stored = localStorage.getItem(STORAGE_KEY);
  const parsed = stored ? (JSON.parse(stored) as string[]) : SUGGESTED;
  const [selected, setSelected] = useState<string[]>(parsed);

  const toggle = (niche: string) => {
    setSelected((prev) =>
      prev.includes(niche) ? prev.filter((item) => item !== niche) : [...prev, niche]
    );
  };

  const handleContinue = (niches: string[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(niches));
    onNext();
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-700">Escolha os nichos que você atende.</p>
      <div className="space-y-2">
        {SUGGESTED.map((niche) => (
          <label key={niche} className="flex items-center gap-2 text-sm text-slate-800">
            <input
              type="checkbox"
              checked={selected.includes(niche)}
              onChange={() => toggle(niche)}
              className="h-4 w-4 rounded border-slate-300 text-slate-900"
            />
            {niche}
          </label>
        ))}
      </div>
      <div className="flex justify-end gap-3">
        <button
          type="button"
          className="text-sm text-slate-600"
          onClick={() => handleContinue([])}
        >
          Pular
        </button>
        <button
          type="button"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          onClick={() => handleContinue(selected)}
        >
          Continuar
        </button>
      </div>
    </div>
  );
};
