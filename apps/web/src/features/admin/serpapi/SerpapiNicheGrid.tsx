type SerpapiNicheItem = {
  nicheId: string;
  nicheName: string;
  companiesCount: number;
};

type SerpapiNicheGridProps = {
  items: SerpapiNicheItem[];
  query: string;
  onSelect: (item: SerpapiNicheItem) => void;
};

export const SerpapiNicheGrid = ({ items, query, onSelect }: SerpapiNicheGridProps) => {
  const normalized = query.trim().toLowerCase();
  const filtered = normalized
    ? items.filter((item) => item.nicheName.toLowerCase().includes(normalized))
    : items;

  if (filtered.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
        Nenhum nicho encontrado.
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {filtered.map((item) => (
        <button
          key={item.nicheId}
          type="button"
          onClick={() => onSelect(item)}
          className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-[1px] hover:shadow-md"
          data-testid="serpapi-niche-card"
        >
          <p className="text-sm font-semibold text-slate-900">{item.nicheName}</p>
          <p className="mt-2 text-xl font-bold text-amber-500">
            {item.companiesCount.toLocaleString("pt-BR")}
          </p>
          <p className="text-xs text-slate-500">empresas</p>
        </button>
      ))}
    </div>
  );
};
