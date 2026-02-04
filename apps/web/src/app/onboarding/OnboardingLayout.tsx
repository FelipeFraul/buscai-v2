import { type ReactNode } from "react";

type OnboardingLayoutProps = {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
};

export const OnboardingLayout = ({ title, description, children, footer }: OnboardingLayoutProps) => (
  <div className="min-h-screen bg-slate-50">
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 py-10">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold text-slate-900">{title}</h1>
        {description ? <p className="text-sm text-slate-600">{description}</p> : null}
      </header>
      <main className="flex-1">
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">{children}</div>
      </main>
      {footer ? <footer className="mt-4">{footer}</footer> : null}
    </div>
  </div>
);
