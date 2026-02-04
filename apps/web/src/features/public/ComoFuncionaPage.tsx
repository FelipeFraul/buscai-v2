const steps = [
  {
    title: "1. Cadastre sua empresa",
    text: "Inclua informações básicas, canais e escolha os nichos onde quer aparecer.",
  },
  {
    title: "2. Indexamos e ranqueamos",
    text: "Aplicamos lances pagos e relevância orgânica para definir sua posição.",
  },
  {
    title: "3. Apareça no WhatsApp",
    text: "Quando alguém busca, sua empresa surge primeiro no BUSCAI e no WhatsApp.",
  },
];

const questions = [
  {
    q: "Preciso pagar para aparecer?",
    a: "Você pode pagar para destacar, mas também aparece organicamente conforme relevância.",
  },
  { q: "Onde os dados ficam?", a: "No seu Postgres local (docker compose) rodando em 3001." },
  {
    q: "Posso testar agora?",
    a: "Sim. Use o login demo@buscai.app / demo123 e busque por Itapetininga.",
  },
];

export const ComoFuncionaPage = () => {
  return (
    <div className="space-y-10">
      <section className="rounded-3xl bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-semibold text-slate-900">Como funciona</h1>
        <p className="mt-2 text-sm text-slate-600">
          Versão demo conectada ao Postgres local com cidade Itapetininga e nichos/empresas seedados.
          Login demo: demo@buscai.app / demo123.
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {steps.map((step) => (
            <div
              key={step.title}
              className="rounded-2xl border border-amber-100 bg-amber-50/70 p-5 shadow-sm"
            >
              <h3 className="text-lg font-semibold text-amber-900">{step.title}</h3>
              <p className="mt-2 text-sm text-amber-800">{step.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-6 rounded-3xl bg-slate-900 p-8 text-slate-50 shadow-sm lg:grid-cols-2">
        <div className="flex items-center justify-center">
          <img
            src="/images/landing/how-to-connect.png"
            alt="Fluxo BUSCAI"
            className="w-full max-w-md"
          />
        </div>
        <div className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-wide text-amber-300">
            Fluxo rápido
          </p>
          <h2 className="text-2xl font-semibold">Do cadastro ao WhatsApp</h2>
          <p className="text-sm text-slate-200">
            Cadastre, escolha nichos, lance para destaque ou siga orgânico. Quando alguém buscar,
            mostramos sua empresa no BUSCAI e no WhatsApp.
          </p>
        </div>
      </section>

      <section className="rounded-3xl bg-white p-8 shadow-sm">
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <img
              src="/images/landing/faq-photo.png"
              alt="FAQ BUSCAI"
              className="w-full max-w-sm rounded-2xl"
            />
          </div>
          <div className="space-y-3">
            <p className="text-sm font-semibold uppercase tracking-wide text-amber-700">
              Suas dúvidas
            </p>
            <h2 className="text-2xl font-semibold text-slate-900">FAQ</h2>
            <div className="space-y-3">
              {questions.map((item) => (
                <details
                  key={item.q}
                  className="rounded-xl border border-amber-100 bg-amber-50 p-4"
                >
                  <summary className="cursor-pointer text-sm font-semibold text-amber-900">
                    {item.q}
                  </summary>
                  <p className="mt-2 text-sm text-amber-800">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
