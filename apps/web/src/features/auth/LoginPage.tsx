import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

import { useLogin } from "./useLogin";

export const LoginPage = () => {
  const { mutation: login, formError } = useLogin();
  const demoEmail = "demo@buscai.app";
  const demoPassword = "demo123";
  const [email, setEmail] = useState(demoEmail);
  const [password, setPassword] = useState(demoPassword);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    login.mutate({ email, password });
  };

  return (
    <div className="rounded-3xl bg-white/90 p-8 shadow-lg">
      <form className="space-y-5" onSubmit={handleSubmit}>
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold text-amber-900">Entrar</h1>
          <p className="text-sm text-slate-600">Use suas credenciais do painel BUSCAÍ.</p>
          <p className="text-xs text-amber-700">Dica: demo@buscai.app / demo123</p>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-amber-900" htmlFor="email">
            E-mail
          </label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
            placeholder="demo@buscai.app"
            className="border-amber-200 focus:border-amber-400 focus:ring-amber-400"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-amber-900" htmlFor="password">
            Senha
          </label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            autoComplete="current-password"
            placeholder="demo123"
            className="border-amber-200 focus:border-amber-400 focus:ring-amber-400"
          />
        </div>
        {formError ? (
          <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{formError}</p>
        ) : null}
        <Button
          className="w-full bg-amber-500 text-amber-950 hover:bg-amber-400"
          type="submit"
          disabled={login.isPending}
        >
          {login.isPending ? "Entrando..." : "Entrar"}
        </Button>
      </form>
    </div>
  );
};
