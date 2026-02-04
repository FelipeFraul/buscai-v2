const collapseSpaces = (value: string) => value.trim().replace(/\s+/g, " ");

export const toDigits = (input?: string | null): string | null => {
  if (!input) return null;
  const digits = input.replace(/\D/g, "");
  return digits.length ? digits : null;
};

export const normalizePhoneToE164BR = (input?: string | null): string | null => {
  if (!input) return null;
  const digits = toDigits(input);
  if (!digits) return null;
  if (digits.startsWith("55")) {
    return `+${digits}`;
  }
  return `+55${digits}`;
};

export const normalizeWebsite = (input?: string | null): string | null => {
  if (!input) return null;
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;
  return trimmed.replace(/\/+$/, "");
};

export const normalizeName = (input?: string | null): string | null => {
  if (!input) return null;
  const normalized = collapseSpaces(input).toLowerCase();
  return normalized ? normalized : null;
};

export const normalizeAddressLine = (input?: string | null): string | null => {
  if (!input) return null;
  const normalized = collapseSpaces(input);
  return normalized ? normalized : null;
};
