export interface CompanyNiche {
  nicheId: string;
  nome: string;
  status: "ativo" | "inativo";
  buscas: number;
  aparicoes: number;
  cliques: number;
  custo: number;
  ctr: number;
}
