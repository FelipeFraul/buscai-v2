import { apiClient } from "@/lib/api/client";

import { type Product } from "./types";

const numberOrZero = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  if (Number.isNaN(parsed) || parsed < 0) return 0;
  return parsed;
};

const normalizeProduct = (raw: any): Product => ({
  id: raw?.id ?? "",
  nome: raw?.nome ?? "",
  descricao: raw?.descricao ?? "",
  preco: numberOrZero(raw?.preco),
  status: raw?.status === "ativo" ? "ativo" : "inativo",
  aparicoes: numberOrZero(raw?.aparicoes),
  cliques: numberOrZero(raw?.cliques),
  ctr: numberOrZero(raw?.ctr),
});

export async function fetchProducts(): Promise<Product[]> {
  const response = await apiClient.get("/products", { params: { legacy: 1 } });
  const items = Array.isArray(response.data) ? response.data : [];
  return items.map(normalizeProduct);
}

export async function createProduct(input: {
  nome: string;
  descricao: string;
  preco: number;
}): Promise<Product> {
  const payload = {
    nome: input.nome ?? "",
    descricao: input.descricao ?? "",
    preco: Math.max(0, input.preco ?? 0),
  };

  const response = await apiClient.post("/products", payload);
  return normalizeProduct(response.data);
}

export async function updateProduct(
  id: string,
  input: { nome: string; descricao: string; preco: number; status: "ativo" | "inativo" }
): Promise<Product> {
  const payload = {
    nome: input.nome ?? "",
    descricao: input.descricao ?? "",
    preco: Math.max(0, input.preco ?? 0),
    status: input.status === "ativo" ? "ativo" : "inativo",
  };

  const response = await apiClient.put(`/products/${id}`, payload);
  return normalizeProduct(response.data);
}
