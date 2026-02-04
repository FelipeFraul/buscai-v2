import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { useAuth } from "@/features/auth/AuthContext";
import { formatCurrencyFromCents } from "@/lib/utils";

import { useMeCompany } from "./useMeCompany";
import { useCompanySelection } from "@/features/companies/useCompanySelection";

const baseNavItems = [
  { to: "/leilao", label: "Leilão" },
  { to: "/produtos", label: "Produtos" },
  { to: "/contatos", label: "Contatos" },
];

const navLinkClasses = (isActive: boolean) =>
  [
    "rounded-full px-3 py-2 text-sm font-semibold transition-colors",
    isActive ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
  ].join(" ");

const Logo = () => (
  <div className="flex items-center gap-3">
    <div className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-600 text-lg font-bold text-white shadow-sm">
      B
    </div>
    <div>
      <p className="text-sm font-semibold uppercase tracking-wide text-slate-900">BUSCAI</p>
      <p className="text-xs font-medium text-slate-500">Visibilidade que gera resultados</p>
    </div>
  </div>
);

const FooterBar = () => (
  <footer className="mt-10 border-t border-slate-800 bg-slate-900 text-slate-100">
    <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-amber-400/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-200">
          Plataforma segura
        </span>
        <span className="text-slate-300">LGPD pronta</span>
      </div>
      <div className="flex items-center gap-3 text-slate-300">
        <span className="font-semibold text-white">BUSCAI</span>
        <span className="text-xs text-slate-400">Painel do Empresário</span>
      </div>
    </div>
  </footer>
);

const AppLayout = () => {
  const { logout, user } = useAuth();
  const { selectedCompanyId } = useCompanySelection();
  const { data: meCompany, isLoading: meCompanyLoading } = useMeCompany(selectedCompanyId);
  const userName = "Felipe Fraul";
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const navItems = [
    ...baseNavItems,
    ...(user?.role === "admin"
      ? [
          { to: "/admin/analytics/searches", label: "Search Analytics" },
          { to: "/admin/abuso", label: "WhatsApp Guard" },
          { to: "/admin/oferecido-por", label: "Oferecido por" },
        ]
      : []),
  ];

  const walletBalance = meCompany?.billing?.wallet?.balanceCents;
  const walletDisplay = meCompanyLoading || !meCompany ? "R$ --" : formatCurrencyFromCents(walletBalance);
  const menuItems = [
    { label: "Perfil", to: "/minha-empresa" },
    { label: "Mensagens", to: "/mensagens" },
    { label: "Gestão", to: "/configuracoes" },
    { label: "Créditos", to: "/creditos" },
    { label: "Notificações", to: "/notificacoes" },
  ];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white/80 shadow-sm backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <Link to="/leilao" className="flex items-center gap-3">
            <Logo />
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
              Créditos Disponíveis – {walletDisplay}
            </span>
            <Button className="bg-[#FFC300] text-slate-900 hover:bg-amber-400">
              Comprar Créditos
            </Button>
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                className="flex items-center gap-3 rounded-full border border-slate-200 bg-white px-3 py-2 shadow-sm transition hover:-translate-y-[1px] hover:shadow-md"
              >
                <div className="text-left">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Gestao</p>
                  <p className="text-sm font-semibold text-slate-900">{userName}</p>
                </div>
                <div className="grid h-10 w-10 place-items-center rounded-full bg-slate-900 text-sm font-semibold text-white">
                  FF
                </div>
              </button>
              {menuOpen ? (
                <div className="absolute right-0 z-20 mt-2 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                  {menuItems.map((item) => (
                    <Link
                      key={item.label}
                      to={item.to}
                      onClick={() => setMenuOpen(false)}
                      className="block w-full px-4 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50"
                    >
                      {item.label}
                    </Link>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      logout();
                    }}
                    className="w-full px-4 py-2 text-left text-sm font-semibold text-rose-600 transition hover:bg-rose-50"
                  >
                    Sair
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <div className="border-t border-slate-100 bg-gradient-to-r from-amber-50 via-white to-emerald-50">
          <nav className="mx-auto flex w-full max-w-6xl items-center gap-2 overflow-x-auto px-4 py-3">
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => navLinkClasses(isActive)}>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pb-10 pt-8">
        <Outlet />
      </main>

      <FooterBar />
    </div>
  );
};

export default AppLayout;
