type AuctionConfig = {
  niche: string;
  bidMax: number;
  active: boolean;
  reserve: number;
  note: string;
};

const mockAuctionConfigs: AuctionConfig[] = [
  { niche: "Desenvolvedor de Aplicativos", bidMax: 4.5, active: true, reserve: 15, note: "Minha empresa" },
  { niche: "Desenvolvedor Web", bidMax: 3.2, active: true, reserve: 10, note: "Primeira escolha" },
  { niche: "Desenvolvedor de Inteligência Artificial", bidMax: 2.5, active: false, reserve: 8, note: "Não avançou" },
];

const mockProductsConfig = [
  { id: "p1", name: "Coca-Cola Lata 350ml", price: "R$ 4,50 / unidade", available: true, category: "Refrigerante" },
  { id: "p2", name: "Cerveja Pilsen 600ml", price: "R$ 8,90 / unidade", available: true, category: "Bebida" },
  { id: "p3", name: "Ventilador de Mesa 40cm", price: "R$ 199,90 / unidade", available: false, category: "Eletro" },
  { id: "p4", name: "Caderno Universitário 200 folhas", price: "R$ 22,90 / unidade", available: true, category: "Papelaria" },
];

const preferences = [
  "Aviso de crédito baixo",
  "Aviso quando cair de posição",
  "Resumo semanal no WhatsApp",
];

export const ConfigPage = () => {
  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-slate-900">Configurações do negócio</h1>
        <p className="text-sm text-slate-600">
          Ajuste dados essenciais do seu negócio, lances e produtos. Tudo simples e direto.
        </p>
      </header>

      <section className="space-y-3 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Leilão — Configurações</h2>
            <p className="text-sm text-slate-600">Escolha nichos ativos, ajuste lances e reservas mínimas.</p>
          </div>
          <button
            type="button"
            className="rounded-full bg-[#FFC300] px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-amber-400"
            onClick={() => console.log("Cadastrar empresa ou nicho")}
          >
            Cadastrar empresa/nicho
          </button>
        </div>
        <div className="space-y-3">
          {mockAuctionConfigs.map((item) => (
            <div
              key={item.niche}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
            >
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-900">{item.niche}</p>
                <p className="text-xs text-slate-600">Reserva mínima: R$ {item.reserve.toFixed(2)}</p>
                <p className="text-xs text-slate-600">Classificação: {item.note}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-800">
                  Lance máx.: R$ {item.bidMax.toFixed(2)}
                </span>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    item.active ? "border border-emerald-200 bg-emerald-50 text-emerald-700" : "border border-slate-200 bg-slate-100 text-slate-700"
                  }`}
                >
                  {item.active ? "Ativo" : "Inativo"}
                </span>
                <button
                  type="button"
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-800 transition hover:bg-slate-100"
                  onClick={() => console.log("Editar lance", item.niche)}
                >
                  Editar lance
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Produtos — Configurações</h2>
            <p className="text-sm text-slate-600">Crie ou ajuste produtos, preços e disponibilidade.</p>
          </div>
          <button
            type="button"
            className="rounded-full bg-[#FFC300] px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-amber-400"
            onClick={() => console.log("Cadastrar novo produto")}
          >
            Cadastrar novo produto
          </button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {mockProductsConfig.map((product) => (
            <div key={product.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{product.name}</p>
                  <p className="text-xs text-slate-600">Categoria: {product.category}</p>
                  <p className="text-xs text-slate-600">Preço: {product.price}</p>
                  <p className="text-xs text-slate-600">Disponibilidade: {product.available ? "Ativo" : "Pausado"}</p>
                </div>
                <button
                  type="button"
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-800 transition hover:bg-slate-100"
                  onClick={() => console.log("Editar produto", product.id)}
                >
                  Editar
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">Preferências</h2>
        <p className="text-sm text-slate-600">Alertas essenciais para acompanhar gastos e posição.</p>
        <div className="space-y-2">
          {preferences.map((pref) => (
            <div key={pref} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-800">
              <span>{pref}</span>
              <button
                type="button"
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-800 transition hover:bg-slate-100"
                onClick={() => console.log("Toggle preferência", pref)}
              >
                Ativar / Desativar
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
