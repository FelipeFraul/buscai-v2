import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";

const steps = [
  {
    title: "1. Por empresa buscada",
    text: "Sua empresa aparece quando alguém procura pelo nicho em que você atua. São 3 posições por leilão e 2 posições orgânicas. Visibilidade imediata para quem está à procura do que você vende.",
  },
  {
    title: "2. Oferecido por",
    text: "Você compra um ou mais nichos (ex.: dentista, gesseiro...). Sempre que alguém buscar por esse nicho, o BUSCAI adiciona ao final da mensagem: 'Oferecido por: SUA EMPRESA', com seu telefone ou site.",
  },
  {
    title: "3. Por produto buscado",
    text: "A empresa adiciona seus produtos no BUSCAI. Quando alguém buscar por um produto específico, ela aparece como fornecedora daquele item. É direto: produto buscado -> você aparece.",
  },
];

const userSearchMessage = "Preciso de um Advogado em Itapetininga";

const auctionCompanies = [
  { name: "Dr. Claudio Damasceno", address: "Rua Jose Maria Joao, 123 - Centro", hasActions: true },
  { name: "Dr. Ismael Jesus", address: "Rua Joao Jose Maria, 234 - Centro", hasActions: true },
  { name: "Dr. Joao Clovis", address: "Rua Maria Joao Jpse, 345 - Centro", hasActions: true },
];

const organicCompanies = [
  { name: "Dr. Alceu do Vale", phone: "15 9.9876-5432" },
  { name: "Dr. Espiridião Gonçalves", phone: "15 9.1234-5678" },
];

const companySearchResults = auctionCompanies.slice(0, 1);

const offeredByEntry = {
  image: "/images/landing/microsoft-365-header.webp",
  title: "Oferecido por: Microsoft",
  cta: "Clique no anúncio e visite nosso site",
  timestamp: "08:42",
};

const productName = "Carregador iPhone 20W";
const productOffers = [
  { price: "R$ 49,90", company: "TechPlus", address: "Rua das Laranjeiras, 110 - Centro" },
  { price: "R$ 59,90", company: "MegaCel", address: "Rua 7 de Setembro, 58 - Centro" },
  { price: "R$ 64,90", company: "FoneMix", address: "Av. Brasil, 200 - Jardim Paulista" },
  { price: "R$ 72,90", company: "ConnectShop", address: "Rua das Acacias, 87 - Vila Nova" },
  { price: "R$ 79,90", company: "BestEletron", address: "Av. da Saudade, 310 - Centro" },
];

const PhoneIcon = ({ className = "" }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.86 19.86 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.86 19.86 0 0 1 2.08 4.18 2 2 0 0 1 4.06 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92Z" />
  </svg>
);

const WhatsappIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 32 32" fill="currentColor" aria-hidden>
    <path d="M16.04 4.5c-6.3 0-11.42 4.98-11.42 11.13 0 2.2.66 4.29 1.91 6.1L4.5 27.5l5.99-1.85c1.74 1.14 3.77 1.74 5.92 1.74 6.3 0 11.42-4.98 11.42-11.13 0-2.97-1.18-5.76-3.33-7.83-2.15-2.08-4.99-3.23-8.06-3.23Zm0 2.08c5.18 0 9.38 3.99 9.38 8.9 0 4.92-4.2 8.9-9.38 8.9-1.85 0-3.61-.5-5.13-1.46l-.37-.23-3.55 1.09 1.16-3.4-.24-.36c-1.17-1.68-1.8-3.64-1.8-5.54 0-4.91 4.2-8.9 9.38-8.9Zm-4.2 3.48c-.19 0-.49.07-.75.33-.26.27-.99.97-.99 2.36 0 1.39 1.02 2.72 1.16 2.91.14.19 1.95 3.12 4.75 4.24.66.27 1.17.43 1.57.55.66.21 1.25.18 1.72.11.53-.08 1.63-.67 1.86-1.32.23-.64.23-1.19.16-1.32-.07-.13-.26-.21-.55-.36-.29-.15-1.72-.88-1.99-.98-.27-.1-.46-.15-.65.15-.19.3-.75.98-.92 1.18-.17.2-.34.22-.63.07-.29-.15-1.23-.49-2.35-1.56-.87-.82-1.46-1.82-1.64-2.12-.17-.3-.02-.46.13-.61.14-.14.3-.36.45-.54.15-.18.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.65-1.54-.89-2.11-.23-.55-.47-.47-.65-.47Z" />
  </svg>
);

const stepMockups = [
  (
    <div className="w-full max-w-xs space-y-3 rounded-xl bg-[#0b141a] p-4 font-[&quot;Segoe UI&quot;,Helvetica,sans-serif] text-sm text-[#e9edef] shadow-[0_0_0_1px_rgba(255,255,255,0.05)]">
      <div className="flex justify-end">
        <div className="max-w-[88%] rounded-lg bg-[#075e54] px-3 py-2 text-[#e9edef] shadow">
          <div>{userSearchMessage}</div>
          <div className="mt-1 text-right text-[10px] text-white/80">{offeredByEntry.timestamp}</div>
        </div>
      </div>
      <div className="space-y-2">
        {companySearchResults.map((item) => (
          <div key={item.name} className="rounded-lg bg-[#202c33] px-3 py-2 text-[#e9edef] shadow">
            <div className="font-semibold leading-tight">{item.name}</div>
            <div className="text-xs text-[#e9edef]">{item.address}</div>
            {item.hasActions ? (
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <span className="inline-flex items-center gap-2 rounded bg-[#111b21] px-2 py-1">
                  <PhoneIcon className="h-3 w-3" />
                  <span>Ligar</span>
                </span>
                <span className="inline-flex items-center gap-2 rounded bg-[#111b21] px-2 py-1">
                  <WhatsappIcon className="h-3 w-3 text-[#25d366]" />
                  <span>WhatsApp</span>
                </span>
              </div>
            ) : null}
            <div className="mt-1 text-right text-[10px] text-[#8696a0]">{offeredByEntry.timestamp}</div>
          </div>
        ))}
      </div>
    </div>
  ),
  (
    <div className="w-full max-w-xs space-y-3 rounded-xl bg-[#0b141a] p-4 font-[&quot;Segoe UI&quot;,Helvetica,sans-serif] text-sm text-[#e9edef] shadow-[0_0_0_1px_rgba(255,255,255,0.05)]">
      <div className="rounded-lg bg-[#202c33] p-2 text-[#e9edef] shadow">
        <img
          src={offeredByEntry.image}
          alt={offeredByEntry.title}
          className="h-28 w-full rounded-md object-cover object-left"
        />
        <div className="mt-2 text-sm font-semibold">{offeredByEntry.title}</div>
        <div className="text-xs text-[#e9edef]">{offeredByEntry.cta}</div>
        <div className="mt-1 text-right text-[10px] text-[#8696a0]">{offeredByEntry.timestamp}</div>
      </div>
    </div>
  ),
  (
    <div className="w-full max-w-xs space-y-3 rounded-xl bg-[#0b141a] p-4 font-[&quot;Segoe UI&quot;,Helvetica,sans-serif] text-sm text-[#e9edef] shadow-[0_0_0_1px_rgba(255,255,255,0.05)]">
      <div className="flex justify-end">
        <div className="max-w-[88%] rounded-lg bg-[#075e54] px-3 py-2 text-[#e9edef] shadow">
          <div>Preciso de {productName}</div>
          <div className="mt-1 text-right text-[10px] text-white/80">{offeredByEntry.timestamp}</div>
        </div>
      </div>
      <div className="space-y-2">
        {productOffers.slice(0, 1).map((offer) => (
          <div key={offer.company} className="rounded-lg bg-[#202c33] px-3 py-2 text-[#e9edef] shadow">
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold leading-tight">{productName}</div>
              <div className="text-xs font-semibold text-[#25d366]">{offer.price}</div>
            </div>
            <div className="text-xs">Fornecido por: {offer.company}</div>
            <div className="text-xs text-[#e9edef]">{offer.address}</div>
            <div className="mt-1 text-right text-[10px] text-[#8696a0]">{offeredByEntry.timestamp}</div>
          </div>
        ))}
      </div>
    </div>
  ),
];

const timelineItems = [
  {
    title: "1. O cliente envia mensagem sobre um serviço ou produto",
    lines: ["A IA entende o texto, identifica a intenção da busca e classifica se é serviço ou produto."],
    badges: ["Intenção", "Detecção", "Classificação"],
  },
  {
    title: "2. Vencedores do leilão e produtos mais baratos aparecem",
    lines: ["A IA busca as 3 posições do leilão, os menores preços, se pesquisado produto e reserva os espaços para resultados orgânicos."],
    badges: ["Leilão", "Ranking", "Orgânicos"],
  },
  {
    title: '3. A IA busca por quem comprou o "Oferecido por"',
    lines: ["Empresas que adquiriram o nicho ou o produto pesquisado pelo cliente entram como oferecimento para a entrega da pesquisa."],
    badges: ["Prioridade", "Aquisição", "Presença"],
  },
  {
    title: "4. A IA entrega a mensagem com endereços e telefones",
    lines: ['A lista final exibe empresas, profissionais ou produtos, com botões de contato e o "oferecido por" destacado com imagem.'],
    badges: ["Contato", "Imediato", "Transparente"],
  },
];

const stats = [
  { label: "Nichos Disponíveis", value: "250+", change: "+12%", footer: "+18 nos últimos 30 dias", tone: "light" },
  { label: "Empresas Cadastradas", value: "1.500+", change: "+8.3%", footer: "+634 nos últimos 30 dias", tone: "mid" },
  { label: "Pesquisas Realizadas", value: "12.5K+", change: "+24.1%", footer: "+24.7k nos últimos 30 dias", tone: "dark" },
];

const testimonials = [
  { name: "Itape Ordinária", niche: "Comunicação • Itapetininga-SP" },
  { name: "Silva & Associados", niche: "Advocacia • Itapetininga-SP" },
  { name: "Clínica Odonto Smile", niche: "Odontologia • Itapetininga-SP" },
  { name: "Clínica de Olhos", niche: "Oftalmologista • Itapetininga-SP" },
];

const faqItems = [
  "O que é o BUSCAI?",
  "Como aparece meu nome ou minha empresa na pesquisa?",
  "Como funciona o sistema de leilão?",
  "Como uma empresa pode se cadastrar?",
  "Como recarrego créditos na plataforma?",
  "Como acompanho meu desempenho?",
  "É possível ver quanto os concorrentes estão investindo?",
];

export const HomePage = () => {
  const [hoveredMockup, setHoveredMockup] = useState<number | null>(null);
  const [fullModalIndex, setFullModalIndex] = useState<number | null>(null);
  const [selectedBonusAmount, setSelectedBonusAmount] = useState<number>(100);

  const renderFullModalContent = () => {
    if (fullModalIndex === null) return null;

    if (fullModalIndex === 0) {
      return (
        <div className="space-y-2 text-[#e9edef]">
          <div className="flex justify-end">
            <div className="max-w-[90%] rounded-lg bg-[#075e54] px-3 py-2 shadow">
              <div>{userSearchMessage}</div>
              <div className="mt-1 text-right text-[10px] text-white/80">{offeredByEntry.timestamp}</div>
            </div>
          </div>
          {auctionCompanies.map((item) => (
            <div key={item.name} className="rounded-lg bg-[#202c33] px-3 py-2 shadow">
              <div className="font-semibold leading-tight">{item.name}</div>
              <div className="text-xs text-[#e9edef]">{item.address}</div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <span className="inline-flex items-center gap-2 rounded bg-[#111b21] px-2 py-1">
                  <PhoneIcon className="h-3 w-3" />
                  <span>Ligar</span>
                </span>
                <span className="inline-flex items-center gap-2 rounded bg-[#111b21] px-2 py-1">
                  <WhatsappIcon className="h-3 w-3 text-[#25d366]" />
                  <span>WhatsApp</span>
                </span>
              </div>
              <div className="mt-1 text-right text-[10px] text-[#8696a0]">{offeredByEntry.timestamp}</div>
            </div>
          ))}
          {organicCompanies.map((item) => (
            <div key={item.name} className="rounded-lg bg-[#202c33] px-3 py-2 text-[#e9edef] shadow">
              <div className="font-semibold leading-tight">{item.name}</div>
              <div className="text-xs">{item.phone}</div>
              <div className="mt-1 text-right text-[10px] text-[#8696a0]">{offeredByEntry.timestamp}</div>
            </div>
          ))}
          <div className="rounded-lg bg-white/5 px-3 py-2 text-white/50 opacity-30 blur-[3px] shadow-none">
            <img
              src={offeredByEntry.image}
              alt={offeredByEntry.title}
              className="h-28 w-full rounded-md object-cover object-left"
            />
            <div className="mt-2 font-semibold leading-tight">{offeredByEntry.title}</div>
            <div className="text-xs">{offeredByEntry.cta}</div>
            <div className="mt-1 text-right text-[10px] text-[#8696a0]">{offeredByEntry.timestamp}</div>
          </div>
        </div>
      );
    }

    if (fullModalIndex === 1) {
      return (
        <div className="space-y-2 text-[#e9edef]">
          <div className="flex justify-end opacity-30 blur-[3px]">
            <div className="max-w-[90%] rounded-lg bg-white/5 px-3 py-2 text-white/50 shadow-none">
              <div>{userSearchMessage}</div>
              <div className="mt-1 text-right text-[10px] text-white/50">{offeredByEntry.timestamp}</div>
            </div>
          </div>
          {auctionCompanies.map((item) => (
            <div key={item.name} className="rounded-lg bg-white/5 px-3 py-2 text-white/50 opacity-30 blur-[3px] shadow-none">
              <div className="font-semibold leading-tight">{item.name}</div>
              <div className="text-xs">{item.address}</div>
              <div className="mt-1 text-right text-[10px] text-white/50">{offeredByEntry.timestamp}</div>
            </div>
          ))}
          {organicCompanies.map((item) => (
            <div key={item.name} className="rounded-lg bg-white/5 px-3 py-2 text-white/50 opacity-30 blur-[3px] shadow-none">
              <div className="font-semibold leading-tight">{item.name}</div>
              <div className="text-xs">{item.phone}</div>
              <div className="mt-1 text-right text-[10px] text-white/50">{offeredByEntry.timestamp}</div>
            </div>
          ))}
          <div className="rounded-lg bg-[#202c33] px-3 py-2 text-[#e9edef] shadow">
            <img
              src={offeredByEntry.image}
              alt={offeredByEntry.title}
              className="h-28 w-full rounded-md object-cover object-left"
            />
            <div className="mt-2 text-sm font-semibold">{offeredByEntry.title}</div>
            <div className="text-xs">{offeredByEntry.cta}</div>
            <div className="mt-1 text-right text-[10px] text-[#8696a0]">{offeredByEntry.timestamp}</div>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-2 text-[#e9edef]">
        <div className="flex justify-end">
          <div className="max-w-[90%] rounded-lg bg-[#075e54] px-3 py-2 shadow">
            <div>{`Preciso de ${productName}`}</div>
            <div className="mt-1 text-right text-[10px] text-white/80">{offeredByEntry.timestamp}</div>
          </div>
        </div>
        {productOffers.map((offer) => (
          <div key={offer.company} className="rounded-lg bg-[#202c33] px-3 py-2 text-[#e9edef] shadow">
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold leading-tight">{productName}</div>
              <div className="text-xs font-semibold text-[#25d366]">{offer.price}</div>
            </div>
            <div className="text-xs">Fornecido por: {offer.company}</div>
            <div className="text-xs text-[#c2c7cb]">{offer.address}</div>
            <div className="mt-1 text-right text-[10px] text-[#8696a0]">{offeredByEntry.timestamp}</div>
          </div>
        ))}
        <div className="rounded-lg bg-white/5 px-3 py-2 text-white/50 opacity-30 blur-[3px] shadow-none">
          <img
            src={offeredByEntry.image}
            alt={offeredByEntry.title}
            className="h-28 w-full rounded-md object-cover object-left"
          />
          <div className="mt-2 font-semibold leading-tight">{offeredByEntry.title}</div>
          <div className="text-xs">{offeredByEntry.cta}</div>
          <div className="mt-1 text-right text-[10px] text-[#8696a0]">{offeredByEntry.timestamp}</div>
        </div>
      </div>
    );
  };

  const bonusTotal = selectedBonusAmount * 2;

  return (
    <div className="space-y-0">
      {fullModalIndex !== null ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4"
          onClick={() => setFullModalIndex(null)}
        >
          <div
            className="relative w-full max-w-[420px] rounded-2xl bg-[#0b141a] p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 text-center text-sm font-semibold text-[#e9edef]">
              {fullModalIndex === 0
                ? "Visualização completa - Empresa buscada"
                : fullModalIndex === 1
                  ? "Visualização completa - Oferecido por"
                  : "Visualização completa - Por produto buscado"}
            </div>
            {renderFullModalContent()}
          </div>
        </div>
      ) : null}
      {/* Hero */}
      <section className="relative w-full bg-[#FFC300] px-6 sm:px-10">
        <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-10 py-16 lg:flex-row lg:gap-16 lg:py-0 min-h-[calc(98vh-72px)]">
          <div className="space-y-12 text-white lg:basis-[60%] lg:max-w-[60%] lg:self-center">
            <h1 className="text-6xl font-bold leading-tight md:text-6xl lg:text-[4rem]">
              <span className="block uppercase">QUER VENDER MAIS? VEM PARA O BUSCAI</span>
            </h1>
            <p className="text-[1.6rem] font-bold uppercase text-black/90 md:text-[1.7rem]">
              Sua empresa aparece no WhatsApp de quem está procurando o que você oferece
            </p>
            <p className="text-[1.3rem] text-black/90">
              Com o BUSCAI é zero esforço. Clientes reais te chamando por ligação ou mensagem, exatamente quando precisa dos seus serviços ou produtos.
              Seu negócio aparece no WhatsApp, telefone e endereço, exatamente quando alguém mais precisa de você. Preparado para mais chamadas, mais conversas e mais clientes?
            </p>
            <Button
              asChild
              className="mt-9 inline-flex w-auto items-center gap-2 bg-black px-5 py-3 text-base font-semibold text-white hover:bg-black/90"
            >
              <Link to="/search/companies">
                Conhecer a Plataforma <span aria-hidden>↓</span>
              </Link>
            </Button>
          </div>
          <div className="relative flex w-full justify-center py-6 lg:basis-[36%] lg:max-w-[36%] lg:items-end lg:justify-end lg:py-12">
            <div className="absolute inset-4 scale-110 transform rounded-[32px] bg-black/10 blur-3xl" aria-hidden />
            <img
              src="/images/landing/hero-mobile1-mock.png"
              alt="BUSCAI no WhatsApp (fundo)"
              className="absolute left-6 top-0 h-auto max-w-[420px]"
            />
            <img
              src="/images/landing/hero-mobile-mock.png"
              alt="BUSCAI no WhatsApp"
              className="relative left-24 top-1 h-auto max-w-[380px]"
            />
          </div>
        </div>
      </section>
      {/* Steps */}
      <section className="w-full bg-black px-6 py-14 text-amber-100 sm:px-10 md:py-16">
        <div className="mx-auto flex w-full max-w-[1280px] flex-col">
          <div className="space-y-12 text-center">
            <span className="inline-flex items-center justify-center rounded-full bg-[#FFC300] px-3 py-1 text-[1rem] font-semibold text-black">
              Escolha como sua empresa aparece no BUSCAI
            </span>
            <h2 className="text-4xl font-bold leading-[1.1] md:text-5xl lg:text-[3.5rem] uppercase">
              <span className="block text-white">TRÊS MANEIRAS DE APARECER</span>
              <span className="block text-[#FFC300]">PARA QUEM ESTÁ TE PROCURANDO</span>
            </h2>
            <p className="text-[1.5rem] text-white">O BUSCAI entrega sua empresa quando alguém busca seu nicho, seu serviço ou seu produto</p>
          </div>
          <div className="mt-12 grid w-full gap-9 self-center md:grid-cols-3">
            {steps.map((step, index) => {
              const isHovered = hoveredMockup === index;
              const showDetails = isHovered;
              return (
                <div
                  key={step.title}
                  className={`flex h-full w-full flex-col rounded-2xl px-5 py-6 text-left ${
                    showDetails ? "bg-[#FFC300] text-white opacity-100" : "bg-[#FFC300] text-black opacity-80 hover:opacity-100"
                  }`}
                  onMouseEnter={() => setHoveredMockup(index)}
                  onMouseLeave={() => setHoveredMockup(null)}
                  style={{ transition: "all 200ms ease" }}
                >
                  <h3 className="text-[1.2rem] font-semibold uppercase">{step.title}</h3>
                  <div className="relative min-h-[240px] w-full my-6">
                    <div
                      className={`flex w-full flex-col space-y-6 transition-all duration-200 ${
                        showDetails
                          ? "relative opacity-100 translate-y-0"
                          : "pointer-events-none absolute inset-0 opacity-0 translate-y-2"
                      }`}
                    >
                      <p className="text-[1.2rem] text-black/80">{step.text}</p>
                    </div>
                    <div
                      className={`flex w-full justify-center transition-all duration-200 ${
                        showDetails
                          ? "pointer-events-none absolute inset-0 opacity-0 -translate-y-2"
                          : "relative opacity-100 translate-y-0"
                      }`}
                    >
                      {stepMockups[index]}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => setFullModalIndex(index)}
                      className="rounded-lg bg-black px-3 py-2 text-sm font-semibold text-[#e9edef] transition hover:bg-[#1a252e] focus:outline-none"
                    >
                      Clique aqui e veja como sua empresa aparece
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-12 flex w-full justify-center self-center">
            <div className="flex items-center gap-3 rounded-full border bg-white px-3 py-2 text-[1rem] text-black/90">
              <span>Sistema inteligente para você ou sua empresa. Defina o orçamento e prepare seus colaboradores.</span>
            </div>
          </div>
        </div>
      </section>
      {/* Conectar */}
      <section className="w-full bg-[#ffb500] px-6 py-14 sm:px-10 md:py-16">
        <div className="mx-auto flex w-full max-w-[1280px] flex-col">
          <div className="space-y-12 text-center text-black">
            <span className="inline-flex items-center justify-center rounded-full bg-black px-3 py-1 text-[1rem] font-semibold text-amber-400">
              O que acontece após cada busca?
            </span>
            <h2 className="text-[3.5rem] font-bold uppercase leading-[1.1]">
              <span className="block text-white">PASSO A PASSO DE COMO O BUSCAI</span>
              <span className="block text-black">ENTREGA CLIENTES PARA VOCÊ</span>
            </h2>
            <p className="text-[1.5rem] text-black/80">Do pedido feito no WhatsApp até a ligação para sua empresa, tudo acontece em segundos</p>
          </div>
          <div className="relative mx-auto mt-12 w-full max-w-5xl px-4 sm:px-8">
            <div className="absolute left-1/2 top-0 bottom-0 w-[1px] -translate-x-1/2 bg-black" aria-hidden />
            <div className="space-y-12">
              {timelineItems.map((item, idx) => {
                const isLeft = idx % 2 === 0;
                return (
                  <div
                    key={item.title}
                    className="relative grid grid-cols-2 items-start"
                    style={idx === 1 || idx === 2 || idx === 3 ? { marginTop: "-5.5rem" } : undefined}
                  >
                    <div className="absolute left-1/2 top-6 -translate-x-1/2">
                      <div className="h-3 w-3 rounded-full bg-black" />
                    </div>
                    <div className={isLeft ? "col-span-1 col-start-1 max-w-[1280px] flex justify-end pr-6" : "col-span-1 col-start-2 flex justify-start pl-6"}>
                      <div className="relative w-[620px] max-w-[620px] min-w-[620px] rounded-2xl border border-black/15 bg-black/90 px-6 py-5 text-amber-100 shadow-[0_10px_40px_-20px_rgba(0,0,0,0.6)] backdrop-blur text-left cursor-ew-resize">
                        <div className="pointer-events-none absolute top-1/2 right-6 flex -translate-y-1/2 items-center gap-4">
                          <div className="rounded-full bg-white/30" />
                        </div>
                        <span
                          className={
                            isLeft
                              ? "absolute top-8 left-full h-[1px] w-8 -translate-x-1 bg-gradient-to-r from-black/70 to-transparent"
                              : "absolute top-8 right-full h-[1px] w-8 translate-x-1 bg-gradient-to-l from-black/70 to-transparent"
                          }
                          aria-hidden
                        />
                        <div className="flex items-center justify-start text-xs text-amber-200/70">
                          <span className="rounded-full bg-white/10 px-2 py-1 font-semibold">Etapa 0{idx + 1}</span>
                        </div>
                        <h3 className="mt-3 text-lg font-semibold text-white">{item.title}</h3>
                        <div className="mt-2 space-y-2 text-[1.05rem] leading-relaxed text-amber-50/90">
                          {item.lines.map((line) => (
                            <p key={line}>{line}</p>
                          ))}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/60">
                          {(item.badges ?? ["Tempo real", "Sem fricção", "WhatsApp first"]).map((badge) => (
                            <span key={badge} className="rounded-full bg-white/10 px-3 py-1">
                              {badge}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
      {/* Resultados */}
      <section className="w-full bg-white px-6 py-16 text-black sm:px-10 md:py-18">
        <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-12">
          <div className="space-y-5 text-center">
            <span className="inline-flex items-center justify-center rounded-full bg-[#FFC300] px-3 py-1 text-sm font-semibold text-black">
              Resultados em tempo real
            </span>
            <h2 className="text-[3rem] font-bold uppercase leading-tight md:text-[3.2rem]">
              <span className="block text-black">DADOS CLAROS PARA VOCÊ</span>
              <span className="block text-[#FFC300]">ENTENDER SEU RETORNO</span>
            </h2>
            <p className="text-[1.5rem] text-black/80">
              Acompanhe o desempenho dos seus nichos e produtos, em tempo real, direto no painel da sua empresa.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-6">
            <div className="rounded-2xl border border-black/10 bg-[#FFC300] p-7 shadow-[0_12px_32px_-18px_rgba(0,0,0,0.25)] lg:col-span-2">
              <div className="mb-4">
                <h3 className="text-xl font-bold text-black">Buscas recebidas</h3>
              </div>
              <div className="space-y-3">
                <div>
                  <h3 className="text-lg font-semibold text-black">Buscas por nicho</h3>
                  <p className="text-sm text-black/80">Mostra quantas buscas acionaram os nichos.</p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-black">Buscas por produto</h3>
                  <p className="text-sm text-black/80">Exibe quantas pesquisas acionaram os produtos</p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-black">Volume total de procura</h3>
                  <p className="text-sm text-black/80">Buscas acumuladas da sua empresa</p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-black">Horários de pico</h3>
                  <p className="text-sm text-black/80">Identifica os horários com maior buscas</p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-black">Crescimento por período</h3>
                  <p className="text-sm text-black/80">Mostra a evolução da demanda ao longo dos dias</p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-black/10 bg-[#FFC300] p-7 shadow-[0_12px_32px_-18px_rgba(0,0,0,0.25)] lg:col-span-2">
              <div className="mb-4">
                <h3 className="text-xl font-bold text-black">Aparições por tipo</h3>
              </div>
              <div className="space-y-3">
                <div>
                  <h3 className="text-lg font-semibold text-black">Leilão (1, 2 e 3)</h3>
                  <p className="text-sm text-black/80">Aparecimentos nas posições pagas via lance.</p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-black">Orgânicos (4 e 5)</h3>
                  <p className="text-sm text-black/80">Exposições naturais, sem custo.</p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-black">Oferecido por</h3>
                  <p className="text-sm text-black/80">Exibições impressas do nicho ou produto.</p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-black">Produto buscado</h3>
                  <p className="text-sm text-black/80">Aparecimentos específicos via busca por item.</p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-black">Exibições totais</h3>
                  <p className="text-sm text-black/80">Somatório geral de todas as aparições.</p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-black/10 bg-[#FFC300] p-7 shadow-[0_12px_32px_-18px_rgba(0,0,0,0.25)] lg:col-span-2">
              <div className="mb-4">
                <h3 className="text-xl font-bold text-black">Cliques e contatos</h3>
                <p className="text-sm font-semibold text-black/70">Ligar / WhatsApp / Ações</p>
              </div>
              <div className="space-y-3">
                <div>
                  <h3 className="text-lg font-semibold text-black">Cliques em "Ligar"</h3>
                  <p className="text-sm text-black/80">Chamadas diretas feitas para sua empresa.</p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-black">Cliques no WhatsApp</h3>
                  <p className="text-sm text-black/80">Abertura de conversa direta com você.</p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-black">Taxa de ação por aparição</h3>
                  <p className="text-sm text-black/80">Qual porcentagem das aparições virou clique.</p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-black">Chamadas por horário</h3>
                  <p className="text-sm text-black/80">Horários em que você recebe mais contatos.</p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-black/10 bg-[#FFC300] p-7 shadow-[0_12px_32px_-18px_rgba(0,0,0,0.25)] lg:col-span-3">
              <div className="mb-4">
                <h3 className="text-xl font-bold text-black">Custos e rendimento</h3>
              </div>
              <div className="space-y-3">
                <div>
                  <h3 className="text-lg font-semibold text-black">Gastos em leilões</h3>
                  <p className="text-sm text-black/80">Quanto foi investido em lances.</p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-black">Custo por aparição</h3>
                  <p className="text-sm text-black/80">Quanto você pagou por cada entrega.</p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-black">Custo por clique</h3>
                  <p className="text-sm text-black/80">Quanto custou cada ação real do cliente.</p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-black/10 bg-[#FFC300] p-7 shadow-[0_12px_32px_-18px_rgba(0,0,0,0.25)] lg:col-span-3">
              <div className="mb-4">
                <h3 className="text-xl font-bold text-black">Retorno e desempenho</h3>
              </div>
              <div className="space-y-3">
                <div>
                  <h3 className="text-lg font-semibold text-black">Retorno por nicho</h3>
                  <p className="text-sm text-black/80">Desempenho individual por área de atuação.</p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-black">Retorno por produto</h3>
                  <p className="text-sm text-black/80">Quais itens geram mais resultados.</p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-black">Desempenho por horário / dia</h3>
                  <p className="text-sm text-black/80">Entenda quando a demanda é mais forte.</p>
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-center justify-center gap-3 text-center text-black">
            <p className="text-lg font-semibold text-black">Pronto para ver esses dados no seu painel?</p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild className="bg-[#FFC300] px-5 py-2 font-semibold text-black hover:bg-amber-300">
                <Link to="/search/companies">Cadastrar minha empresa agora</Link>
              </Button>
              <Link
                to="/pricing"
                className="inline-flex items-center justify-center rounded-lg border border-black/20 px-5 py-2 text-sm font-semibold text-black transition hover:bg-black/5"
              >
                Ver planos e preços
              </Link>
            </div>
          </div>
        </div>
      </section>
      {/* Créditos */}
      <section className="w-full bg-black px-6 py-16 text-amber-100 sm:px-10 md:py-18">
        <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-12">
          <div className="space-y-5 text-center">
            <span className="inline-flex items-center justify-center rounded-full bg-[#FFC300] px-3 py-1 text-sm font-semibold text-black">
              Multiplique sua força no leilão
            </span>
            <h2 className="text-[3rem] font-bold uppercase leading-tight md:text-[3.2rem]">
              <span className="block text-white">COMPRE CRÉDITOS E GANHE BÔNUS</span>
              <span className="block text-black">PARA APARECER MAIS NO TOPO</span>
            </h2>
            <p className="text-[1.5rem] text-amber-100/80">
              Quanto maior o pacote, maior o seu ganho. Mais crédito significa mais posições no topo, mais contatos e mais vendas.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {[
              { title: "PACOTE 10", price: "R$ 10,00", bonus: "+20% de bônus", total: "Crédito total: R$ 12", desc: "Ideal para testar o topo e aparecer nos horários certos." },
              { title: "PACOTE 25", price: "R$ 25,00", bonus: "+40% de bônus", total: "Crédito total: R$ 35", desc: "Mais aparições diárias, mais competitividade no nicho." },
              { title: "PACOTE 50", price: "R$ 50,00", bonus: "+70% de bônus", total: "Crédito total: R$ 85", desc: "Força real para disputar posições durante todo o dia." },
            ].map((pkg) => (
              <div key={pkg.title} className="flex h-full flex-col rounded-2xl border border-[#FFC300]/25 bg-[#111] p-5 shadow-[0_10px_30px_-18px_rgba(0,0,0,0.6)]">
                <div className="text-xs font-semibold text-amber-200/80">💛 {pkg.title}</div>
                <div className="mt-3 text-3xl font-bold text-white">{pkg.price}</div>
                <div className="mt-2 text-sm font-semibold text-[#FFC300]">{pkg.bonus}</div>
                <div className="text-sm text-amber-100/90">{pkg.total}</div>
                <p className="mt-4 text-sm text-amber-100/80">{pkg.desc}</p>
                {pkg.title === "PACOTE 10" ? (
                  <div className="mt-2 space-y-1 text-xs text-amber-200/80">
                    <p>Indicado para autônomos e pequenas empresas que estão começando no BUSCAI.</p>
                    <p>Bom para validar nichos e entender o retorno antes de investir mais.</p>
                  </div>
                ) : null}
                {pkg.title === "PACOTE 25" ? (
                  <div className="mt-2 space-y-1 text-xs text-amber-200/80">
                    <p>Recomendado para quem já recebe buscas frequentes e quer subir nas posições.</p>
                    <p>Equilíbrio entre custo baixo e força consistente no leilão.</p>
                  </div>
                ) : null}
                {pkg.title === "PACOTE 50" ? (
                  <div className="mt-2 space-y-1 text-xs text-amber-200/80">
                    <p>Ideal para empresas que precisam de volume de chamadas e contatos.</p>
                    <p>Ajuda a não perder espaço para concorrentes que também investem em crédito.</p>
                  </div>
                ) : null}
                <div className="mt-auto pt-4">
                  <Button className="w-full bg-[#FFC300] text-black hover:bg-amber-300">Comprar</Button>
                </div>
              </div>
            ))}
            <div className="flex h-full flex-col rounded-2xl border border-[#FFC300]/25 bg-[#111] p-5 shadow-[0_10px_30px_-18px_rgba(0,0,0,0.6)]">
              <div className="text-xs font-semibold text-amber-200/80">💛 PACOTE 100+ (o mais forte)</div>
              <div className="mt-3 text-3xl font-bold text-white">R$ 100,00</div>
              <div className="mt-2 text-sm font-semibold text-[#FFC300]">+100% de bônus (ganha o dobro)</div>
              <div className="mt-3 space-y-1 text-sm text-amber-100/90">
                <p>Compra R$ {selectedBonusAmount} → ganha R$ {selectedBonusAmount} → total R$ {bonusTotal}</p>
                <p className="text-xs text-amber-200/80">Crédito total atual baseado no valor escolhido.</p>
              </div>
              <div className="mt-4">
                <label className="text-xs font-semibold text-amber-200/80">Escolha o valor</label>
                <select
                  className="mt-2 w-full rounded-lg border border-[#FFC300]/40 bg-black/60 px-3 py-2 text-sm text-amber-100 focus:border-[#FFC300] focus:outline-none"
                  value={selectedBonusAmount}
                  onChange={(e) => setSelectedBonusAmount(Number(e.target.value))}
                >
                  {[100, 200, 500, 1000].map((value) => (
                    <option key={value} value={value}>
                      R$ {value}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-auto pt-4">
                <Button className="w-full bg-[#FFC300] text-black hover:bg-amber-300">Comprar pacote 100+</Button>
              </div>
            </div>
          </div>
        </div>
      </section>
      {/* Planos Produtos */}
      <section className="w-full bg-[#ffb500] px-6 py-16 text-black sm:px-10 md:py-18">
        <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-12">
          <div className="space-y-5 text-center">
            <span className="inline-flex items-center justify-center rounded-full bg-black px-3 py-1 text-sm font-semibold text-white">
              Planos de produtos
            </span>
            <h2 className="text-[3rem] font-bold uppercase leading-tight md:text-[3.2rem]">
              <span className="block text-white">VOCÊ PODE ANUNCIAR</span>
              <span className="block text-black">PARA QUEM QUER COMPRAR O SEU PRODUTO</span>
            </h2>
            <p className="text-[1.5rem] text-black">
              Você escolhe quantos produtos quer anunciar por dia e ainda recebe crédito automático para disputar o leilão das posições.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            <div className="flex h-full flex-col rounded-2xl border border-[#FFC300]/25 bg-[#0f0f0f] p-6 shadow-[0_10px_30px_-18px_rgba(0,0,0,0.6)]">
              <div className="mb-4 flex items-center justify-between text-xs font-semibold text-amber-200/80">
                <span className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-[#FFC300]">🧰 Produtos essenciais</span>
                <span className="rounded-full bg-[#FFC300]/20 px-3 py-1 text-[#FFC300]">Plano 1</span>
              </div>
              <h3 className="text-[2.25rem] font-bold uppercase leading-tight text-white">1 produto por dia</h3>
              <p className="mt-1 text-sm font-semibold text-[#FFC300]">+ R$ 4,70 de crédito para o leilão</p>
              <p className="mt-3 text-3xl font-bold text-white">
                R$ 34,70<span className="text-base font-semibold text-amber-200/80">/mês</span>
              </p>
              <ul className="mt-4 space-y-2 text-sm text-amber-100/90">
                <li>Ative 1 produto por dia no BUSCAI</li>
                <li>Seu item aparece nas buscas imediatamente</li>
                <li>Mais presença diária sem esforço</li>
                <li>Entrega direta por WhatsApp ou ligação</li>
                <li>Relatórios básicos de desempenho</li>
                <li>Monitoramento de buscas e horários de pico</li>
                <li>Ideal para testar com baixo custo</li>
              </ul>
              <div className="mt-auto pt-5">
                <Button asChild className="w-full bg-[#FFC300] text-black hover:bg-amber-300">
                  <Link to="/pricing">Começar com 1 produto</Link>
                </Button>
              </div>
            </div>
            <div className="flex h-full flex-col rounded-2xl border border-[#FFC300]/25 bg-[#0f0f0f] p-6 shadow-[0_10px_30px_-18px_rgba(0,0,0,0.6)]">
              <div className="mb-4 flex items-center justify-between text-xs font-semibold text-amber-200/80">
                <span className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-[#FFC300]">🏆 Produtos profissionais</span>
                <span className="rounded-full bg-[#FFC300]/20 px-3 py-1 text-[#FFC300]">Plano 2</span>
              </div>
              <h3 className="text-[2.25rem] font-bold uppercase leading-tight text-white">3 produtos por dia</h3>
              <p className="mt-1 text-sm font-semibold text-[#FFC300]">+ R$ 9,70 de crédito para o leilão</p>
              <p className="mt-3 text-3xl font-bold text-white">
                R$ 64,70<span className="text-base font-semibold text-amber-200/80">/mês</span>
              </p>
              <ul className="mt-4 space-y-2 text-sm text-amber-100/90">
                <li>Ative 3 produtos por dia no BUSCAI</li>
                <li>Maior frequência de aparições nas buscas</li>
                <li>Mais presença diária para catálogo ativo</li>
                <li>Entrega direta por WhatsApp ou ligação</li>
                <li>Relatórios completos de desempenho</li>
                <li>Monitoramento de nichos, produtos e picos</li>
                <li>Ideal para quem precisa aparecer todos os dias</li>
              </ul>
              <div className="mt-auto pt-5">
                <Button asChild className="w-full bg-[#FFC300] text-black hover:bg-amber-300">
                  <Link to="/pricing">Ativar 3 produtos</Link>
                </Button>
              </div>
            </div>
            <div className="flex h-full flex-col rounded-2xl border border-[#FFC300]/25 bg-[#0f0f0f] p-6 shadow-[0_10px_30px_-18px_rgba(0,0,0,0.6)]">
              <div className="mb-4 flex items-center justify-between text-xs font-semibold text-amber-200/80">
                <span className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-[#FFC300]">🚀 Produtos ilimitados</span>
                <span className="rounded-full bg-[#FFC300]/20 px-3 py-1 text-[#FFC300]">Plano 3</span>
              </div>
              <h3 className="text-[2.25rem] font-bold uppercase leading-tight text-white">7 produtos por dia</h3>
              <p className="mt-1 text-sm font-semibold text-[#FFC300]">+ R$ 14,70 de crédito para o leilão</p>
              <p className="mt-3 text-3xl font-bold text-white">
                R$ 74,70<span className="text-base font-semibold text-amber-200/80">/mês</span>
              </p>
              <ul className="mt-4 space-y-2 text-sm text-amber-100/90">
                <li>Ative até 7 produtos por dia no BUSCAI</li>
                <li>Máxima presença diária nas buscas</li>
                <li>Dominância de catálogo e volume alto</li>
                <li>Entrega direta por WhatsApp ou ligação</li>
                <li>Relatórios avançados com histórico completo</li>
                <li>Monitoramento de desempenho por período</li>
                <li>Ideal para quem quer dominar volume de busca real</li>
              </ul>
              <div className="mt-auto pt-5">
                <Button asChild className="w-full bg-[#FFC300] text-black hover:bg-amber-300">
                  <Link to="/pricing">Ativar 7 produtos</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
      {/* Métricas */}
      <section className="w-full bg-[#ffb500] px-6 py-16 text-center sm:px-10 md:py-18">
        <div className="mx-auto flex w-full max-w-[1280px] flex-col items-center">
          <div className="space-y-12">
            <span className="inline-flex items-center justify-center rounded-full bg-black px-3 py-1 text-[1rem] font-semibold text-white">
              Crescimento acelerado
            </span>
            <h2 className="text-[3.5rem] font-bold uppercase leading-[1.1] text-black">
              <span className="block text-black">NICHOS ATIVOS, EMPRESAS CADASTRADAS</span>
              <span className="block text-white">E MILHARES DE PESQUISAS REALIZADAS</span>
            </h2>
            <p className="text-[1.5rem] text-black/80">
              Milhares de empresas já utilizam nossa plataforma, crescendo +24% em buscas e +634 novos cadastros no último mês.
            </p>
          </div>
          <div className="mt-12 grid w-full gap-9 overflow-hidden rounded-2xl shadow-sm sm:grid-cols-3">
            {stats.map((item) => (
              <div
                key={item.label}
                className={`space-y-9 px-6 py-7 text-left ${
                  item.tone === "dark" ? "bg-black text-amber-100" : item.tone === "mid" ? "bg-white text-black" : "bg-amber-200 text-black"
                }`}
              >
                <p className="text-[1.2rem] font-semibold uppercase">{item.label}</p>
                <p className="text-4xl font-bold">{item.value}</p>
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <span className={`rounded-full px-2 py-0.5 ${item.tone === "dark" ? "bg-amber-800 text-amber-100" : "bg-black/10 text-black"}`}>
                    {item.change}
                  </span>
                  <span className="text-[1.2rem] opacity-80">{item.footer}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      {/* Depoimentos */}
      <section className="w-full bg-black px-6 py-14 text-amber-100 sm:px-10 md:py-16">
        <div className="mx-auto flex w-full max-w-[1280px] flex-col">
          <div className="space-y-12 text-center">
            <span className="inline-flex items-center justify-center rounded-full bg-amber-500 px-3 py-1 text-[1rem] font-semibold text-black">
              Empresas que confiam
            </span>
            <h2 className="text-[3.5rem] font-bold uppercase leading-[1.1] text-amber-300">
              <span className="block text-white">EMPRESAS QUE ACREDITAM</span>
              <span className="block text-black">E AJUDAM A DAR VIDA AO PROJETO</span>
            </h2>
            <p className="text-[1.5rem] text-amber-200">
              Elas são parte essencial para que o BUSCAI conecte negócios a clientes todos os dias.
            </p>
          </div>
          <div className="mx-auto mt-12 grid w-full gap-9 lg:grid-cols-[1fr,1.2fr]">
            <div className="space-y-9">
              {testimonials.map((item) => (
                <div key={item.name} className="space-y-9 rounded-xl bg-amber-400 px-4 py-3 text-black shadow-sm">
                  <p className="text-[1.2rem] font-semibold uppercase">{item.name}</p>
                  <p className="text-[1.2rem] text-black/80">{item.niche}</p>
                </div>
              ))}
            </div>
            <div className="rounded-2xl bg-white px-5 py-6 text-slate-800 shadow-sm">
              <p className="text-[1.2rem] leading-relaxed">
                Acreditar no BUSCAI é acreditar no futuro dos negócios locais. O projeto conecta quem procura com quem oferece, de forma direta, inteligente e acessível. Isso amplia a visibilidade, cria novas oportunidades e fortalece o ecossistema econômico.
              </p>
              <p className="mt-9 text-right text-xs font-semibold text-slate-600">INEGY JR — CEO</p>
            </div>
          </div>
        </div>
      </section>
      {/* FAQ */}
      <section className="w-full bg-[#ffb500] px-6 py-14 sm:px-10 md:py-16">
        <div className="mx-auto flex w-full max-w-[1280px] flex-col">
          <div className="space-y-12 text-center">
            <span className="inline-flex items-center justify-center rounded-full bg-black px-3 py-1 text-[1rem] font-semibold text-amber-400">
              Perguntas frequentes
            </span>
            <h2 className="text-[3.5rem] font-bold uppercase leading-[1.1] text-black">
              <span className="block text-white">SUAS DÚVIDAS SOBRE O BUSCAI</span>
              <span className="block text-black">EXPLICADAS DE FORMA SIMPLES</span>
            </h2>
            <p className="text-[1.5rem] text-black/80">Descubra como nossa plataforma conecta clientes e empresas com baixo custo.</p>
          </div>
          <div className="mt-12 grid w-full gap-9 lg:grid-cols-[0.9fr,1.1fr]">
            <div className="flex justify-center">
              <img
                src="/images/landing/faq-photo.png"
                alt="Pessoa usando o BUSCAI"
                className="w-full max-w-sm rounded-2xl shadow-lg"
              />
            </div>
            <div className="space-y-3">
              {faqItems.map((item) => (
                <div key={item} className="flex items-center justify-between rounded-xl bg-amber-400 px-4 py-3 text-black">
                  <span className="text-[1.2rem] font-semibold uppercase">{item}</span>
                  <span aria-hidden className="text-black/70">+</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
      {/* CTA final */}
      <section className="w-full bg-white px-6 py-16 text-center sm:px-10 md:py-18">
        <div className="mx-auto flex w-full max-w-[1280px] flex-col items-center space-y-12 text-center">
          <span className="inline-flex items-center justify-center rounded-full bg-amber-500 px-3 py-1 text-[1rem] font-semibold text-black">
            Números que impressionam
          </span>
          <h2 className="text-[3.5rem] font-bold uppercase leading-[1.1] text-black">
            <span className="block text-white">COMO APARECER NO WHATSAPP QUANDO</span>
            <span className="block text-amber">PROCURAM PELO SEU SERVIÇO</span>
          </h2>
          <p className="text-[1.5rem] text-ambar-200">
            Mais de 500 empresas confiam na nossa IA para aparecer nas primeiras buscas do WhatsApp. Seja o próximo a dominar seu mercado.
          </p>
          <div className="flex justify-center">
            <Button asChild className="bg-black text-amber-400 hover:bg-black/90">
              <Link to="/search/companies">Entrar na Plataforma</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
};
