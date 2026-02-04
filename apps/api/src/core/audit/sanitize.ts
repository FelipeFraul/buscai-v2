const MAX_STRING_LENGTH = 200;
const MAX_ARRAY_LENGTH = 20;
const MAX_DEPTH = 4;

const BLOCKED_KEYS = new Set(
  [
    "from",
    "to",
    "phone",
    "text",
    "textraw",
    "textpreview",
    "query",
    "message",
    "content",
    "body",
    "data",
    "config",
    "request",
    "headers",
    "stack",
  ].map((key) => key.toLowerCase())
);

const ALLOWED_KEYS = new Set(
  [
    "provider",
    "phoneMasked",
    "messageId",
    "status",
    "reason",
    "durationMs",
    "code",
    "isAxiosError",
    "attempts",
    "resultsCount",
    "queryLength",
    "error",
    "companyId",
    "tenantId",
    "cityId",
    "nicheId",
  ].map((key) => key.toLowerCase())
);

const SAFE_META_KEY_PATTERN =
  /(id|count|ms|status|reason|code|type|version|kind|source)$/i;
const SENSITIVE_KEY_PATTERN =
  /(phone|tel|mobile|whats|email|cpf|cnpj|token|secret|auth|bearer|cookie|session)/i;
const DANGEROUS_STRUCTURE_KEY_PATTERN =
  /(raw|payload|request|response|headers|config|stack|trace)/i;

const truncateString = (value: string): string =>
  value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}...` : value;

const isAllowedKey = (key: string): boolean =>
  ALLOWED_KEYS.has(key.toLowerCase()) || SAFE_META_KEY_PATTERN.test(key);

const isSensitiveKey = (key: string): boolean => {
  const normalized = key.toLowerCase();
  if (BLOCKED_KEYS.has(normalized)) return true;
  return (
    SENSITIVE_KEY_PATTERN.test(key) || DANGEROUS_STRUCTURE_KEY_PATTERN.test(key)
  );
};

const sanitizeValue = (value: unknown, depth: number): unknown => {
  if (depth <= 0) return "[truncated]";
  if (value == null) return value;
  if (typeof value === "string") return truncateString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Error) return truncateString(value.message || "error");

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_LENGTH).map((item) => sanitizeValue(item, depth - 1));
  }

  if (typeof value === "object") {
    return sanitizeAuditPayload(value as Record<string, unknown>, depth - 1);
  }

  return "[unknown]";
};

const sanitizeError = (value: unknown): string => {
  if (value instanceof Error) return truncateString(value.message || "error");
  if (typeof value === "string") return truncateString(value);
  if (value && typeof value === "object" && "message" in (value as Record<string, unknown>)) {
    const message = (value as Record<string, unknown>).message;
    if (typeof message === "string") return truncateString(message);
  }
  return "error";
};

const collectSensitivePaths = (
  value: unknown,
  path: string,
  found: string[],
  depth: number
): void => {
  if (depth <= 0 || value == null || found.length >= 10) return;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length && index < MAX_ARRAY_LENGTH; index += 1) {
      collectSensitivePaths(value[index], `${path}[${index}]`, found, depth - 1);
      if (found.length >= 10) return;
    }
    return;
  }
  if (typeof value !== "object") return;

  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const nextPath = path ? `${path}.${key}` : key;
    if (!isAllowedKey(key) && isSensitiveKey(key)) {
      found.push(nextPath);
      if (found.length >= 10) return;
    }
    collectSensitivePaths(nested, nextPath, found, depth - 1);
    if (found.length >= 10) return;
  }
};

export function assertNoSensitiveKeys(payload: Record<string, unknown>): void {
  const sensitivePaths: string[] = [];
  collectSensitivePaths(payload, "", sensitivePaths, MAX_DEPTH + 1);
  if (sensitivePaths.length > 0) {
    throw new Error(
      `Sensitive keys are not allowed in audit payload: ${sensitivePaths.join(", ")}`
    );
  }
}

export function sanitizeAuditPayload(
  payload: Record<string, unknown>,
  depth = MAX_DEPTH
): Record<string, unknown> {
  if (depth <= 0 || !payload || typeof payload !== "object") {
    return {};
  }

  const output: Record<string, unknown> = {};

  for (const [key, rawValue] of Object.entries(payload)) {
    if (!isAllowedKey(key)) {
      if (isSensitiveKey(key)) continue;
      continue;
    }

    const sanitized =
      key.toLowerCase() === "error"
        ? sanitizeError(rawValue)
        : sanitizeValue(rawValue, depth - 1);
    if (sanitized !== undefined) {
      output[key] = sanitized;
    }
  }

  return output;
}
