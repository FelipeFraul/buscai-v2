import { useMutation, useQuery } from "@tanstack/react-query";

import {
  createProduct as createProductApi,
  fetchProducts,
  updateProduct as updateProductApi,
} from "./api";

export const useProducts = () => {
  const productsQuery = useQuery({
    queryKey: ["products"],
    queryFn: fetchProducts,
  });

  const createMutation = useMutation({
    mutationFn: createProductApi,
    onSuccess: () => {
      productsQuery.refetch();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: { nome: string; descricao: string; preco: number; status: "ativo" | "inativo" };
    }) => updateProductApi(id, input),
    onSuccess: () => {
      productsQuery.refetch();
    },
  });

  return {
    products: productsQuery.data ?? [],
    loading: productsQuery.isLoading,
    error: productsQuery.error,
    refetch: productsQuery.refetch,
    createProduct: async (input: { nome: string; descricao: string; preco: number }) => {
      try {
        await createMutation.mutateAsync(input);
        return true;
      } catch (error) {
        console.error("Erro ao criar produto", error);
        return false;
      }
    },
    updateProduct: (
      id: string,
      input: { nome: string; descricao: string; preco: number; status: "ativo" | "inativo" }
    ) =>
      updateMutation.mutateAsync({ id, input }).then(
        () => true,
        (error) => {
          console.error("Erro ao atualizar produto", error);
          return false;
        }
      ),
  };
};
