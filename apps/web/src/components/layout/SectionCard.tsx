import type { ReactNode } from "react";

type SectionCardProps = {
  title: string;
  subtitle: string;
  className?: string;
  children: ReactNode;
};

export const SectionCard = ({ title, subtitle, className, children }: SectionCardProps) => {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm ${className ?? ""}`}>
      <div>
        <h2 className="text-xl font-bold text-slate-900">{title}</h2>
        <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
};
