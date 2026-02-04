export interface Product {
  id: string;
  nome: string;
  descricao: string;
  preco: number;
  status: "ativo" | "inativo";
  aparicoes?: number;
  cliques?: number;
  ctr?: number;
}
