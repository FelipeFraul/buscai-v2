import { useState } from "react";

type Step1CityProps = {
  onNext: () => void;
};

const STORAGE_KEY = "onb_city";

export const Step1City = ({ onNext }: Step1CityProps) => {
  const [city, setCity] = useState(
    localStorage.getItem(STORAGE_KEY) || "Sua cidade (detectada)"
  );

  const handleNext = () => {
    localStorage.setItem(STORAGE_KEY, city.trim());
    onNext();
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium text-slate-800" htmlFor="city">
          Qual cidade você atende?
        </label>
        <input
          id="city"
          type="text"
          className="mt-2 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
          value={city}
          onChange={(e) => setCity(e.target.value)}
        />
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          onClick={handleNext}
        >
          Continuar
        </button>
      </div>
    </div>
  );
};
