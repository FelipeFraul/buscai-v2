import { Link, Outlet } from "react-router-dom";

export const PublicLayout = () => {
  const navItems = [
    { to: "/search/companies", label: "Buscar empresas" },
    { to: "/search/products", label: "Buscar produtos" },
    { to: "/como-funciona", label: "Como funciona" },
    { to: "/login", label: "Entrar" },
  ];

  return (
    <div className="min-h-screen bg-amber-50 text-slate-900">
      <header className="sticky top-0 z-20 border-b border-black bg-black">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-[18px] md:py-6">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center text-amber-100">
              <img src="/images/landing/footer-logo.png" alt="BUSCAI" className="h-10 w-auto" />
            </Link>
          </div>
          <nav className="hidden items-center gap-2 text-sm font-medium text-amber-50 md:flex">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="rounded-full px-3 py-1 transition hover:bg-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex md:hidden">
            <Link
              to="/login"
              className="rounded-full bg-amber-500 px-3 py-1 text-sm font-semibold text-amber-950 shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              Entrar
            </Link>
          </div>
        </div>
      </header>
      <main className="w-full">
        <Outlet />
      </main>
      <footer className="mt-12 border-t border-black bg-black px-6 sm:px-10">
        <div className="mx-auto grid w-full max-w-[1280px] gap-6 py-10 text-sm text-amber-100 sm:grid-cols-[1.2fr,1fr,1fr,1fr]">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <img
                src="/images/landing/footer-logo.png"
                alt="BUSCAI logo"
                className="h-7 w-auto"
              />
              <div className="text-xs">
                <p className="font-semibold">BUSCAI</p>
                <p className="text-amber-300">Visibilidade que gera resultados</p>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-amber-200">
              Plataforma que conecta pessoas e empresas pelo WhatsApp, com IA para ranquear e gerar
              resultados reais.
            </p>
            <div className="text-xs text-amber-300">
              <p>Santa Cecília, São Paulo/SP</p>
              <p>15 99785-2723</p>
              <p>falecom@buscai.online</p>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-semibold text-amber-300">Institucional</p>
            <Link to="/como-funciona" className="hover:text-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-400">
              Sobre nós
            </Link>
            <Link to="/search/companies" className="hover:text-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-400">
              Entrar na plataforma
            </Link>
            <Link to="/login" className="hover:text-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-400">
              Login
            </Link>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-semibold text-amber-300">Legal</p>
            <span className="text-amber-200">Termos de Uso</span>
            <span className="text-amber-200">Política de Privacidade</span>
            <span className="text-amber-200">Cookies</span>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-semibold text-amber-300">Segurança</p>
            <span className="text-amber-200">SSL Certificado</span>
            <span className="text-amber-200">LGPD Compliance</span>
            <span className="text-amber-200">Plataforma Segura</span>
          </div>
        </div>
        <div className="border-t border-amber-800 px-4 py-4 text-center text-xs text-amber-300">
          © 2024 BUSCAI — Todos os direitos reservados.
        </div>
      </footer>
    </div>
  );
};
