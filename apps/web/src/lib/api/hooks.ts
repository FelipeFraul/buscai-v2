import {
  useMutation,
  useQuery,
} from "@tanstack/react-query";
import type {
  QueryKey,
  UseMutationOptions,
  UseQueryOptions,
} from "@tanstack/react-query";

type MaybeUndefined<T> = T | undefined;

type CreateQueryConfig<TData, TVariables> = {
  queryKey: QueryKey | ((variables: TVariables) => QueryKey);
  queryFn: (variables: TVariables) => Promise<TData>;
};

export function createQuery<TData, TVariables = void>(
  config: CreateQueryConfig<TData, TVariables>
) {
  return (
    variables?: MaybeUndefined<TVariables>,
    options?: Omit<
      UseQueryOptions<TData, unknown, TData, QueryKey>,
      "queryKey" | "queryFn"
    >
  ) => {
    const resolvedVariables =
      (variables as TVariables) ?? (undefined as unknown as TVariables);
    const key =
      typeof config.queryKey === "function"
        ? config.queryKey(resolvedVariables)
        : config.queryKey;

    return useQuery({
      queryKey: key,
      queryFn: () => config.queryFn(resolvedVariables),
      ...(options ?? {}),
    });
  };
}

type CreateMutationConfig<TData, TVariables> = {
  mutationKey?: QueryKey;
  mutationFn: (variables: TVariables) => Promise<TData>;
};

export function createMutation<TData, TVariables = void>(
  config: CreateMutationConfig<TData, TVariables>
) {
  return (
    options?: Omit<
      UseMutationOptions<TData, unknown, TVariables, unknown>,
      "mutationFn" | "mutationKey"
    >
  ) =>
    useMutation({
      mutationKey: config.mutationKey,
      mutationFn: config.mutationFn,
      ...(options ?? {}),
    });
}
