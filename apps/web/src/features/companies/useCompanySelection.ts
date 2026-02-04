import { useEffect, useMemo, useState } from "react";

import type { components } from "@/lib/api/types";

import { useCompanies } from "./useCompanies";

type Company = components["schemas"]["Company"];

const STORAGE_KEY = "buscai.selected_company_id";
const EVENT_NAME = "buscai.companySelection";

const readStoredSelection = (): string | undefined => {
  if (typeof window === "undefined") {
    return undefined;
  }
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored || undefined;
};

export const useCompanySelection = () => {
  const companiesQuery = useCompanies();
  const companies = useMemo<Company[]>(
    () => companiesQuery.data?.items ?? [],
    [companiesQuery.data]
  );

  const [selection, setSelection] = useState<string | undefined>(() => readStoredSelection());

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (selection) {
      window.localStorage.setItem(STORAGE_KEY, selection);
      window.dispatchEvent(
        new CustomEvent(EVENT_NAME, { detail: { companyId: selection } })
      );
    }
  }, [selection]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleSelectionEvent = (event: Event) => {
      const detail = (event as CustomEvent).detail as { companyId?: string } | undefined;
      const nextCompanyId = detail?.companyId;
      if (nextCompanyId && nextCompanyId !== selection) {
        setSelection(nextCompanyId);
      }
    };

    window.addEventListener(EVENT_NAME, handleSelectionEvent as EventListener);
    return () => window.removeEventListener(EVENT_NAME, handleSelectionEvent as EventListener);
  }, [selection]);

  useEffect(() => {
    if (companies.length === 0) {
      return;
    }
    if (selection && companies.some((company) => company.id === selection)) {
      return;
    }

    const stored = readStoredSelection();
    if (stored && companies.some((company) => company.id === stored)) {
      setSelection(stored);
      return;
    }

    setSelection((prev) => (prev === companies[0]?.id ? prev : companies[0]?.id));
  }, [companies, selection]);

  const isValidSelection = selection
    ? companies.some((company) => company.id === selection)
    : false;

  const selectedCompanyId = isValidSelection
    ? selection
    : companies[0]?.id;

  return {
    companies,
    isLoading: companiesQuery.isLoading,
    isError: companiesQuery.isError,
    selectedCompanyId,
    setSelectedCompanyId: setSelection,
  };
};
