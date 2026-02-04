import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import axios from "axios";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/ToastProvider";
import { apiClient } from "@/lib/api/client";
import { useCities, useNiches } from "@/features/catalog/useCatalog";
import {
  useRunsQuery,
  startImportMutation,
  startManualImportMutation,
  invalidateRunMutation,
  useSerpapiNichesQuery,
  useSerpapiMetricsQuery,
  useSerpapiApiKeyStatusQuery,
  useSerpapiApiKeysQuery,
  useUpdateSerpapiApiKeyMutation,
  useSerpapiNicheBulkMutation,
  useSerpapiRunPublishMutation,
} from "@/features/admin/serpapi/api";
import { SerpapiNicheGrid } from "@/features/admin/serpapi/SerpapiNicheGrid";
import { SerpapiNicheCompaniesModal } from "@/features/admin/serpapi/SerpapiNicheCompaniesModal";

const PREVIEW_ROWS = 20;
const MAX_UPLOAD_FILE_BYTES = 2 * 1024 * 1024;
const MAX_UPLOAD_ROWS = 5000;
const MANUAL_IMPORT_MAX_FIELD_LENGTH = 500;
const SERPAPI_COST_PER_RESULT_USD = 0.01;
const HIGH_LIMIT_THRESHOLD = 150;
const PRESET_STORAGE_KEY = "serpapi_collect_presets_v1";
const EMOJI_REGEX = /[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}]/gu;
const VISUAL_JUNK_REGEX = /[\*\u2022\u00B7\u007C\^~`\u00B4\u00A8]/g;
const ZERO_WIDTH_REGEX = /[\u200D\uFE0F]/g;
const LETTERS = "A-Za-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u00FF";

const formatDateTime = (value?: string | null) => {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

const formatDuration = (start?: string | null, end?: string | null) => {
  if (!start) return "--";
  const startAt = new Date(start).getTime();
  if (Number.isNaN(startAt)) return "--";
  const endAt = end ? new Date(end).getTime() : Date.now();
  const delta = Math.max(endAt - startAt, 0);
  const totalSeconds = Math.floor(delta / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m ${seconds}s`;
};

const statusBadge = (status?: string | null) => {
  const value = status ?? "unknown";
  const label =
    value === "done"
      ? "Done"
      : value === "running"
        ? "Running"
        : value === "failed" || value === "invalidated"
          ? "Error"
          : value === "pending"
            ? "Running"
            : "Running";
  const tone =
    label === "Done"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : label === "Error"
        ? "bg-rose-50 text-rose-700 border-rose-200"
        : "bg-blue-50 text-blue-700 border-blue-200";
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${tone}`}>
      {label}
    </span>
  );
};

const MetricPill = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-2xl bg-slate-50 px-3 py-2">
    <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
    <p className="text-sm font-semibold text-slate-900">{value}</p>
  </div>
);

const resolveSourceLabel = (query?: string | null) => {
  if (!query) return "Maps";
  if (query === "manual_upload") return "Upload";
  return "Maps";
};

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

const normalizePunctuation = (value: string) =>
  value
    .replace(/,{2,}/g, ",")
    .replace(/-{2,}/g, "-")
    .replace(/\.+/g, ".")
    .replace(/\s+,/g, ",")
    .replace(/,\s*/g, ", ");

const cleanBaseValue = (value: string) => {
  const withoutEmoji = value.replace(EMOJI_REGEX, "").replace(ZERO_WIDTH_REGEX, "");
  const withoutJunk = withoutEmoji.replace(VISUAL_JUNK_REGEX, " ");
  return normalizePunctuation(normalizeWhitespace(withoutJunk));
};

const cleanCompanyName = (value: string) => {
  const base = cleanBaseValue(value);
  const allowed = new RegExp(`[^${LETTERS}0-9 &\\-\\.\"'()\\/]`, "g");
  const filtered = base.replace(allowed, " ");
  return normalizePunctuation(normalizeWhitespace(filtered));
};

const cleanStreet = (value: string) => {
  const base = cleanBaseValue(value);
  const allowed = new RegExp(`[^${LETTERS}0-9 \\.,\\-\\/\\u00BA\\u00AA\\u00B0()#]`, "g");
  const filtered = base.replace(allowed, " ");
  return normalizePunctuation(normalizeWhitespace(filtered));
};

const cleanCity = (value: string) => {
  const base = cleanBaseValue(value);
  const allowed = new RegExp(`[^${LETTERS} \\-\\.]`, "g");
  const filtered = base.replace(allowed, " ");
  return normalizePunctuation(normalizeWhitespace(filtered));
};

const cleanNiche = (value: string) => cleanCompanyName(value);

const cleanSource = (value: string) => {
  const base = cleanBaseValue(value);
  const allowed = new RegExp(`[^${LETTERS}0-9 &\\-\\.\"'()\\/_:]`, "g");
  const filtered = base.replace(allowed, " ");
  return normalizePunctuation(normalizeWhitespace(filtered));
};

const cleanPhone = (value: string) => {
  const digits = value.replace(/\D/g, "");
  let normalized = digits;
  if (normalized.startsWith("55") && (normalized.length === 12 || normalized.length === 13)) {
    normalized = normalized.slice(2);
  }
  if (normalized.length === 10 || normalized.length === 11) {
    return normalized;
  }
  return "";
};

const cleanUploadValue = (key: keyof UploadMapping, value: string, enabled: boolean) => {
  if (!enabled) {
    return value.trim();
  }
  if (!value) {
    return "";
  }
  switch (key) {
    case "name":
      return cleanCompanyName(value);
    case "address":
      return cleanStreet(value);
    case "city":
      return cleanCity(value);
    case "phone":
      return cleanPhone(value);
    case "niche":
      return cleanNiche(value);
    case "source":
      return cleanSource(value);
    default:
      return cleanBaseValue(value);
  }
};

const parsePreview = (preview?: string | null) => {
  if (!preview) {
    return { title: "--", name: "--", address: "--" };
  }
  try {
    const parsed = JSON.parse(preview) as Record<string, string>;
    return {
      title: parsed.title ?? "--",
      name: parsed.name ?? "--",
      address: parsed.address ?? "--",
    };
  } catch {
    return { title: "--", name: "--", address: "--" };
  }
};

const recordDisplayLabel = (record: {
  rawPreview?: string | null;
  dedupeKey?: string | null;
  id: string;
}) => {
  const preview = parsePreview(record.rawPreview);
  const base = preview.title !== "--" ? preview.title : preview.name;
  return base !== "--" ? base : record.dedupeKey ?? record.id.slice(0, 8);
};

const MetricCard = ({ label, value, helper }: { label: string; value: string; helper?: string }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
    <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
    {helper ? <p className="mt-1 text-xs text-slate-500">{helper}</p> : null}
  </div>
);

const detectDelimiter = (line: string) => {
  const comma = (line.match(/,/g) ?? []).length;
  const semicolon = (line.match(/;/g) ?? []).length;
  return semicolon > comma ? ";" : ",";
};

const parseCsvLine = (line: string, delimiter: string) => {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        current += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === delimiter && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  values.push(current);
  return values.map((value) => value.trim());
};

const parseCsvText = (text: string) => {
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((line) => line.trim().length > 0);
  if (!lines.length) {
    return { headers: [], rows: [] as Record<string, string>[], headerless: false };
  }
  const delimiter = detectDelimiter(lines[0]);
  const firstRow = parseCsvLine(lines[0], delimiter);
  const hasHeader = isLikelyHeaderRow(firstRow);
  const rawHeaders = hasHeader
    ? firstRow.map((header, index) => header || `col_${index + 1}`)
    : firstRow.map((_, index) => `col_${index + 1}`);
  const headers = dedupeHeaders(rawHeaders.map((header) => normalizeHeader(header)));
  const dataLines = lines.slice(hasHeader ? 1 : 0);
  const rows = dataLines.map((line) => {
    const values = parseCsvLine(line, delimiter);
    return headers.reduce<Record<string, string>>((acc, header, index) => {
      acc[header] = values[index] ?? "";
      return acc;
    }, {});
  });
  return { headers, rows, headerless: !hasHeader };
};

const parseJsonText = (text: string) => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("invalid_json");
  }

  const rowSource = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { rows?: unknown }).rows)
      ? (parsed as { rows: unknown[] }).rows
      : null;

  if (!rowSource?.length) {
    throw new Error("invalid_json_shape");
  }

  const objectRows = rowSource.filter(
    (row): row is Record<string, unknown> =>
      !!row && typeof row === "object" && !Array.isArray(row)
  );
  if (!objectRows.length) {
    throw new Error("invalid_json_shape");
  }
  const headers = dedupeHeaders(
    Array.from(
      new Set(
        objectRows.flatMap((row) =>
          Object.keys(row).map((key) => normalizeHeader(key)).filter(Boolean)
        )
      )
    )
  );
  const rows = objectRows.map((row) =>
    headers.reduce<Record<string, string>>((acc, header) => {
      const sourceKey = Object.keys(row).find((key) => normalizeHeader(key) === header);
      const value = sourceKey ? row[sourceKey] : "";
      acc[header] = value === undefined || value === null ? "" : String(value).trim();
      return acc;
    }, {})
  );

  if (!rows.length || !headers.length) {
    throw new Error("invalid_json_shape");
  }

  return { headers, rows, headerless: false };
};

const coerceRowsToStrings = (rows: Record<string, unknown>[], headers: string[]) => {
  return rows.map((row) => {
    return headers.reduce<Record<string, string>>((acc, header) => {
      const raw = (row as Record<string, unknown>)[header];
      let value = raw === null || raw === undefined ? "" : String(raw).trim();
      if (value.length > MANUAL_IMPORT_MAX_FIELD_LENGTH) {
        value = value.slice(0, MANUAL_IMPORT_MAX_FIELD_LENGTH);
      }
      acc[header] = value;
      return acc;
    }, {});
  });
};

const normalizeHeader = (value: string) => {
  const normalized = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized;
};

const dedupeHeaders = (headers: string[]) => {
  const seen = new Map<string, number>();
  return headers.map((header) => {
    const base = header || "col";
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}_${count + 1}`;
  });
};

const isLikelyHeaderRow = (values: string[]) => {
  const normalized = values.map((value) => normalizeHeader(String(value ?? "")));
  const headerHints = [
    "nome",
    "empresa",
    "title",
    "razao",
    "telefone",
    "celular",
    "whatsapp",
    "endereco",
    "logradouro",
    "rua",
    "cidade",
    "municipio",
    "nicho",
    "categoria",
    "segmento",
    "ramo",
    "site",
    "url",
    "instagram",
  ];
  if (normalized.some((value) => headerHints.some((hint) => value.includes(hint)))) {
    return true;
  }
  const numericLike = normalized.filter((value) => value !== "" && /^[0-9]+$/.test(value)).length;
  return numericLike < Math.ceil(values.length / 2);
};

const guessMapping = (headers: string[]) => {
  const used = new Set<string>();
  const findMatch = (keywords: string[]) => {
    for (const keyword of keywords) {
      const match = headers.find((header) => {
        if (used.has(header)) return false;
        return header.includes(keyword);
      });
      if (match) {
        used.add(match);
        return match;
      }
    }
    return "";
  };

  return {
    name: findMatch(["nome", "empresa", "title", "razao"]),
    phone: findMatch(["telefone", "fone", "celular", "whatsapp", "phone"]),
    address: findMatch(["endereco", "logradouro", "rua", "address"]),
    city: findMatch(["cidade", "municipio", "city"]),
    niche: findMatch(["nicho", "categoria", "category", "segmento", "ramo"]),
    source: findMatch(["fonte", "origem", "source"]),
  };
};

const detectUploadMode = (headers: string[], headerless: boolean): UploadMode => {
  const normalized = headers.map((header) => normalizeHeader(header));
  const hasAny = (keywords: string[]) =>
    normalized.some((header) => keywords.some((keyword) => header.includes(keyword)));
  const hasName = hasAny(["nome", "empresa", "title", "razao", "fantasia", "name"]);
  const hasPhone = hasAny(["telefone", "fone", "celular", "whatsapp", "phone", "tel", "mobile"]);
  const hasAddress = hasAny(["endereco", "logradouro", "rua", "address", "street"]);
  const hasNiche = hasAny(["nicho", "categoria", "category", "segmento", "ramo"]);

  if (headerless && headers.length === 1) {
    return "niches";
  }
  if (hasName && hasNiche) {
    return "niches_companies";
  }
  if (hasName || hasPhone || hasAddress) {
    return "companies";
  }
  if (hasNiche || headers.length === 1) {
    return "niches";
  }
  return "companies";
};

type UploadMapping = {
  name: string;
  phone: string;
  address: string;
  niche: string;
  city: string;
  source: string;
};

type ParsedFile = {
  headers: string[];
  rows: Record<string, string>[];
  headerless: boolean;
};

type SerpapiPreset = {
  id: string;
  name: string;
  cityId: string;
  nicheId: string;
  query: string;
  limit: number;
  autoRun: boolean;
  runOnChangeOnly: boolean;
  createdAt: string;
};

type UploadMode = "niches" | "companies" | "niches_companies";

const UPLOAD_MODE_OPTIONS: Array<{ value: UploadMode; label: string }> = [
  { value: "niches", label: "Importar Nichos (lista)" },
  { value: "companies", label: "Importar Empresas (lista)" },
  { value: "niches_companies", label: "Importar Nichos + Empresas" },
];

const SOURCE_OPTIONS = [
  { value: "serpapi", label: "SerpAPI" },
  { value: "google_maps", label: "Google Maps" },
  { value: "local_pack", label: "Local Pack" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "manual", label: "Manual" },
  { value: "upload_manual", label: "Upload manual" },
] as const;

type CompareRecord = {
  id: string;
  dedupeKey: string | null;
  status: string;
  rawPreview: string | null;
};

type CompareResult = {
  added: CompareRecord[];
  removed: CompareRecord[];
  changed: Array<{ before: CompareRecord; after: CompareRecord }>;
};

type Insight = {
  title: string;
  detail: string;
  tone: "neutral" | "warning" | "positive";
};

const periodOptions = [
  { value: "7d", label: "Ultimos 7 dias", days: 7 },
  { value: "30d", label: "Ultimos 30 dias", days: 30 },
  { value: "90d", label: "Ultimos 90 dias", days: 90 },
  { value: "365d", label: "Ultimo ano", days: 365 },
  { value: "all", label: "Todo periodo", days: null },
] as const;

export const SerpapiCollectPage = () => {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [form, setForm] = useState({
    cityId: "",
    nicheId: "",
    query: "",
    limit: 20,
    dryRun: false,
  });
  const citiesQuery = useCities();
  const catalogNichesQuery = useNiches();
  const [runsPage, setRunsPage] = useState(1);
  const runsQuery = useRunsQuery(runsPage, 3, { excludeTests: true });
  const allRunsQuery = useRunsQuery(1, 200, { excludeTests: true });
  const metricsQuery = useSerpapiMetricsQuery();
  const apiKeyStatusQuery = useSerpapiApiKeyStatusQuery();
  const apiKeysQuery = useSerpapiApiKeysQuery();
  const updateApiKeyMutation = useUpdateSerpapiApiKeyMutation();
  const importMutation = startImportMutation();
  const manualImportMutation = startManualImportMutation();
  const invalidateMutation = invalidateRunMutation();
  const publishRunMutation = useSerpapiRunPublishMutation();
  const nicheBulkMutation = useSerpapiNicheBulkMutation();

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [parsedFile, setParsedFile] = useState<ParsedFile | null>(null);
  const [uploadMode, setUploadMode] = useState<UploadMode>("companies");
  const [singleColumnNiche, setSingleColumnNiche] = useState(false);
  const [mapping, setMapping] = useState<UploadMapping>({
    name: "",
    phone: "",
    address: "",
    niche: "",
    city: "",
    source: "",
  });
  const sourceFallback = "upload_manual";
  const [uploadOptions, setUploadOptions] = useState({
    ignoreDuplicates: false,
    updateExisting: false,
    dryRun: false,
    cleanSpecialChars: false,
  });
  const [cityFixedInput, setCityFixedInput] = useState("");
  const [nicheFixedId, setNicheFixedId] = useState("");
  const [sourceFixedValue, setSourceFixedValue] = useState("");

  const [periodFilter, setPeriodFilter] = useState<(typeof periodOptions)[number]["value"]>("30d");
  const [cityFilter, setCityFilter] = useState("all");
  const [nicheFilter, setNicheFilter] = useState("all");
  const [activeRunAction, setActiveRunAction] = useState<string | null>(null);
  const [diffOpenRunId, setDiffOpenRunId] = useState<string | null>(null);
  const [exportFormat, setExportFormat] = useState<"csv" | "json">("csv");
  const [isExporting, setIsExporting] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [apiKeyError, setApiKeyError] = useState("");
  const [presets, setPresets] = useState<SerpapiPreset[]>([]);
  const [presetName, setPresetName] = useState("");
  const [presetAutoRun, setPresetAutoRun] = useState(false);
  const [presetRunOnChangeOnly, setPresetRunOnChangeOnly] = useState(false);
  const [compareRunA, setCompareRunA] = useState<string>("");
  const [compareRunB, setCompareRunB] = useState<string>("");
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null);
  const [isComparing, setIsComparing] = useState(false);
  const [compareError, setCompareError] = useState("");
  const [nicheSearch, setNicheSearch] = useState("");
  const [nicheLookup, setNicheLookup] = useState("");
  const [nicheCountFilter, setNicheCountFilter] = useState<
    "all" | "zero" | "lt5" | "btw5_10" | "btw10_15" | "gt15" | "az" | "za"
  >("all");
  const [selectedNicheId, setSelectedNicheId] = useState<string | null>(null);
  const [isNicheModalOpen, setIsNicheModalOpen] = useState(false);
  const [isNicheExporting, setIsNicheExporting] = useState(false);
  const [isCompanyExporting, setIsCompanyExporting] = useState(false);
  const [isFullExporting, setIsFullExporting] = useState(false);

  const isImporting = importMutation.isPending;
  const isManualImporting = manualImportMutation.isPending;
  const isLoadingRuns = runsQuery.isLoading;
  const hasRunsError = runsQuery.isError;
  const canPrevRunsPage = runsPage > 1;
  const canNextRunsPage = (runsQuery.data?.length ?? 0) === 3;
  const nichesQuery = useSerpapiNichesQuery(nicheSearch, { staleTime: 5 * 60 * 1000 });
  const serpapiNiches = nichesQuery.data ?? [];
  const nicheLookupResults = useMemo(() => {
    const term = nicheLookup.trim().toLowerCase();
    if (term.length < 3) {
      return [];
    }
    return (catalogNichesQuery.data ?? []).filter((niche) =>
      niche.label.toLowerCase().includes(term)
    );
  }, [catalogNichesQuery.data, nicheLookup]);
  const filteredNiches = useMemo(() => {
    const normalizeCount = (value: number) => (Number.isFinite(value) ? value : Number(value) || 0);
    let items = serpapiNiches.map((item) => ({
      ...item,
      companiesCount: normalizeCount(item.companiesCount),
    }));

    switch (nicheCountFilter) {
      case "zero":
        items = items.filter((item) => item.companiesCount === 0);
        break;
      case "lt5":
        items = items.filter((item) => item.companiesCount > 0 && item.companiesCount < 5);
        break;
      case "btw5_10":
        items = items.filter((item) => item.companiesCount >= 5 && item.companiesCount <= 10);
        break;
      case "btw10_15":
        items = items.filter((item) => item.companiesCount > 10 && item.companiesCount <= 15);
        break;
      case "gt15":
        items = items.filter((item) => item.companiesCount > 15);
        break;
      case "az":
        items = [...items].sort((a, b) => a.nicheName.localeCompare(b.nicheName, "pt-BR"));
        break;
      case "za":
        items = [...items].sort((a, b) => b.nicheName.localeCompare(a.nicheName, "pt-BR"));
        break;
      case "all":
      default:
        break;
    }

    const normalizedSearch = nicheSearch.trim().toLowerCase();
    if (!normalizedSearch) {
      return items;
    }
    return items.filter((item) => item.nicheName.toLowerCase().includes(normalizedSearch));
  }, [serpapiNiches, nicheCountFilter, nicheSearch]);
  const selectedNicheIndex = useMemo(() => {
    if (!selectedNicheId) return -1;
    return filteredNiches.findIndex((niche) => niche.nicheId === selectedNicheId);
  }, [filteredNiches, selectedNicheId]);
  const totalNiches = filteredNiches.length;
  const currentNichePosition = selectedNicheIndex >= 0 ? selectedNicheIndex + 1 : 0;

  const latestRuns = runsQuery.data ?? [];
  const allRuns = allRunsQuery.data ?? latestRuns;
  const recentRuns = latestRuns;

  useEffect(() => {
    if (!isNicheModalOpen || !selectedNicheId) {
      return;
    }
    if (filteredNiches.length && selectedNicheIndex === -1) {
      setIsNicheModalOpen(false);
      setSelectedNicheId(null);
    }
  }, [isNicheModalOpen, selectedNicheId, selectedNicheIndex, filteredNiches.length]);

  const limitValue = Number.isFinite(form.limit) ? form.limit : 0;
  const estimatedCost = limitValue * SERPAPI_COST_PER_RESULT_USD;
  const isHighLimit = limitValue >= HIGH_LIMIT_THRESHOLD;

  const previewRows = useMemo(() => parsedFile?.rows.slice(0, PREVIEW_ROWS) ?? [], [parsedFile]);
  const mappedHeaders = useMemo(() => {
    const values = Object.values(mapping).filter((value) => value && value.length > 0);
    return new Set(values);
  }, [mapping]);
  const uploadReport = useMemo(() => {
    if (!parsedFile) return null;
    const totalRows = parsedFile.rows.length;
    const nicheHeader = mapping.niche;
    const nicheCounts = new Map<string, number>();
    let nicheEmptyCount = 0;

    if (nicheHeader) {
      parsedFile.rows.forEach((row) => {
        const raw = row[nicheHeader];
        const value = raw === null || raw === undefined ? "" : String(raw).trim();
        if (!value || value === "-") {
          nicheEmptyCount += 1;
          return;
        }
        nicheCounts.set(value, (nicheCounts.get(value) ?? 0) + 1);
      });
    }

    const topNiches = Array.from(nicheCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([label, count]) => ({ label, count }));

    return {
      totalRows,
      headers: parsedFile.headers,
      nicheDistinctCount: nicheCounts.size,
      nicheEmptyCount,
      topNiches,
    };
  }, [parsedFile, mapping.niche]);
  const normalizeCityLookup = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();
  const resolveCityFromInput = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const match = trimmed.match(/(.*?)(?:\s*[-/])\s*([A-Za-z]{2})$/);
    const name = normalizeCityLookup(match?.[1] ?? trimmed);
    const state = match?.[2]?.toLowerCase() ?? null;
    const cities = citiesQuery.data ?? [];
    if (state) {
      const byState = cities.find(
        (city) =>
          normalizeCityLookup(city.name) === name &&
          city.state.toLowerCase() === state
      );
      if (byState) return byState.id;
    }
    const byName = cities.find((city) => normalizeCityLookup(city.name) === name);
    return byName?.id ?? null;
  };
  const resolvedFixedCityId = resolveCityFromInput(cityFixedInput);
  const requiresCity = uploadMode !== "niches";
  const requiresName = uploadMode !== "niches";
  const hasNameMapping = Boolean(mapping.name);
  const hasNicheMapping =
    Boolean(mapping.niche) || (uploadMode === "niches" && singleColumnNiche);
  const requiresNiche = true;
  const requiresFixedCity = Boolean(parsedFile) && requiresCity && !mapping.city;
  const missingFixedCity = requiresFixedCity && !resolvedFixedCityId;
  const nicheEmptyCount = uploadReport?.nicheEmptyCount ?? 0;
  const hasEmptyNiche = Boolean(mapping.niche) && nicheEmptyCount > 0;
  const shouldBlockImport =
    !uploadOptions.dryRun &&
    (missingFixedCity ||
      (requiresName && !hasNameMapping) ||
      (requiresNiche && !hasNicheMapping) ||
      (uploadMode !== "niches" && hasEmptyNiche));

  const extractedCities = useMemo(() => {
    if (!parsedFile) return [];
    const cityColumns = parsedFile.headers.filter((header) =>
      ["cidade", "city", "municipio"].some((hint) => header.includes(hint))
    );
    if (!cityColumns.length) return [];
    const values = new Set<string>();
    parsedFile.rows.forEach((row) => {
      cityColumns.forEach((col) => {
        const raw = row[col]?.trim();
        if (raw) {
          values.add(raw);
        }
      });
    });
    return Array.from(values).slice(0, 50);
  }, [parsedFile]);

  const sortedRuns = useMemo(
    () =>
      [...allRuns].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    [allRuns]
  );

  const findPreviousRun = (currentId: string) => {
    const current = sortedRuns.find((run) => run.id === currentId);
    if (!current) return null;
    const currentTime = new Date(current.createdAt).getTime();
    return (
      sortedRuns.find(
        (run) =>
          run.id !== current.id &&
          run.cityId === current.cityId &&
          run.nicheId === current.nicheId &&
          new Date(run.createdAt).getTime() < currentTime
      ) ?? null
    );
  };

  const cityMap = useMemo(() => {
    const map = new Map<string, string>();
    (citiesQuery.data ?? []).forEach((city) => {
      map.set(city.id, `${city.name} / ${city.state}`);
    });
    return map;
  }, [citiesQuery.data]);

  const nicheMap = useMemo(() => {
    const map = new Map<string, string>();
    (catalogNichesQuery.data ?? []).forEach((niche) => {
      map.set(niche.id, niche.label);
    });
    return map;
  }, [catalogNichesQuery.data]);

  const mappingFields = useMemo(() => {
    if (uploadMode === "niches") {
      return [{ key: "niche", label: "Categoria / Nicho" }] as const;
    }
    if (uploadMode === "niches_companies") {
      return [
        { key: "niche", label: "Categoria / Nicho" },
        { key: "name", label: "Nome" },
        { key: "phone", label: "Telefone" },
        { key: "address", label: "Endereco" },
        { key: "city", label: "Cidade" },
      ] as const;
    }
    return [
      { key: "name", label: "Nome" },
      { key: "phone", label: "Telefone" },
      { key: "address", label: "Endereco" },
      { key: "niche", label: "Categoria / Nicho" },
      { key: "city", label: "Cidade" },
    ] as const;
  }, [uploadMode]);

  const filteredRuns = useMemo(() => {
    const now = Date.now();
    const selectedPeriod = periodOptions.find((opt) => opt.value === periodFilter);
    const periodStart = selectedPeriod?.days ? now - selectedPeriod.days * 24 * 60 * 60 * 1000 : null;

    return allRuns.filter((run) => {
      const createdAt = new Date(run.createdAt).getTime();
      if (periodStart && createdAt < periodStart) {
        return false;
      }
      if (cityFilter !== "all" && run.cityId !== cityFilter) {
        return false;
      }
      if (nicheFilter !== "all" && run.nicheId !== nicheFilter) {
        return false;
      }
      return true;
    });
  }, [allRuns, periodFilter, cityFilter, nicheFilter]);

  const metrics = useMemo(() => {
    const totals = {
      found: 0,
      inserted: 0,
      conflicts: 0,
      cost: 0,
    };

    const cityTotals = new Map<string, number>();
    const nicheTotals = new Map<string, number>();

    filteredRuns.forEach((run) => {
      totals.found += run.found;
      totals.inserted += run.inserted;
      totals.conflicts += run.conflicts;
      totals.cost += run.found * SERPAPI_COST_PER_RESULT_USD;

      if (run.cityId) {
        cityTotals.set(run.cityId, (cityTotals.get(run.cityId) ?? 0) + run.inserted);
      }
      if (run.nicheId) {
        nicheTotals.set(run.nicheId, (nicheTotals.get(run.nicheId) ?? 0) + run.inserted);
      }
    });

    const findTopKey = (map: Map<string, number>) => {
      let topKey: string | null = null;
      let topValue = -1;
      for (const [key, value] of map.entries()) {
        if (value > topValue) {
          topValue = value;
          topKey = key;
        }
      }
      return topKey;
    };

    const topCityId = findTopKey(cityTotals);
    const topNicheId = findTopKey(nicheTotals);

    const cityLabel = topCityId ? cityMap.get(topCityId) ?? "--" : "--";
    const nicheLabel = topNicheId ? nicheMap.get(topNicheId) ?? "--" : "--";

    const averageCost = totals.inserted > 0 ? totals.cost / totals.inserted : 0;

    return {
      found: totals.found,
      inserted: totals.inserted,
      conflicts: totals.conflicts,
      cost: totals.cost,
      averageCost,
      topCity: cityLabel,
      topNiche: nicheLabel,
    };
  }, [filteredRuns, cityMap, nicheMap]);

  const allTimeMetrics = useMemo(() => {
    const data = metricsQuery.data;
    const totalCompanies = data?.totalCompanies ?? 0;
    const totalNiches = data?.totalNiches ?? 0;
    const totalCities = data?.totalCities ?? 0;
    const topCity = data?.topCity
      ? `${data.topCity.cityName}${data.topCity.cityState ? ` / ${data.topCity.cityState}` : ""}`
      : "--";
    const topNiche = data?.topNiche?.nicheName ?? "--";
    const cost = totalCompanies * SERPAPI_COST_PER_RESULT_USD;
    const averageCost = totalCompanies > 0 ? cost / totalCompanies : 0;

    return {
      totalCompanies,
      totalNiches,
      totalCities,
      topCity,
      topNiche,
      cost,
      averageCost,
    };
  }, [metricsQuery.data]);

  const diagnostics = useMemo(() => {
    const insights: Insight[] = [];
    const runs = filteredRuns.length;
    if (!runs) {
      return insights;
    }
    const found = metrics.found;
    const inserted = metrics.inserted;
    const conflicts = metrics.conflicts;
    const insertedRate = found > 0 ? inserted / found : 0;
    const conflictRate = found > 0 ? conflicts / found : 0;

    if (found > 0 && insertedRate < 0.2) {
      insights.push({
        title: "Baixa taxa de novos resultados",
        detail: `Apenas ${(insertedRate * 100).toFixed(1)}% dos encontrados viraram novos.`,
        tone: "warning",
      });
    }

    if (conflictRate > 0.4) {
      insights.push({
        title: "Nicho pode estar saturado",
        detail: `${(conflictRate * 100).toFixed(1)}% foram duplicados/conflitos.`,
        tone: "warning",
      });
    }

    const topCity = metrics.topCity !== "--" ? metrics.topCity : null;
    if (topCity && inserted >= 10) {
      insights.push({
        title: "Cidade com alto potencial",
        detail: `${topCity} concentra o maior volume de novos.`,
        tone: "positive",
      });
    }

    const hasQuery =
      filteredRuns.some((run) => Boolean(run.query && run.query !== "manual_upload"));
    if (hasQuery && insertedRate < 0.15) {
      insights.push({
        title: "Query pouco eficiente",
        detail: "O retorno de novos esta baixo; vale ajustar termos e limite.",
        tone: "neutral",
      });
    }

    return insights.slice(0, 4);
  }, [filteredRuns, metrics]);

  const handleSelectNiche = (niche: { nicheId: string }) => {
    setSelectedNicheId(niche.nicheId);
    setIsNicheModalOpen(true);
  };

  const handleCloseNicheModal = () => {
    setIsNicheModalOpen(false);
    setSelectedNicheId(null);
  };

  const handlePrevNiche = () => {
    if (selectedNicheIndex > 0) {
      setSelectedNicheId(filteredNiches[selectedNicheIndex - 1]?.nicheId ?? null);
    }
  };

  const handleNextNiche = () => {
    if (selectedNicheIndex >= 0 && selectedNicheIndex < filteredNiches.length - 1) {
      setSelectedNicheId(filteredNiches[selectedNicheIndex + 1]?.nicheId ?? null);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.cityId || !form.nicheId) {
      return;
    }
    await importMutation.mutateAsync(form, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["serpapi", "runs"] });
      },
    });
  };

  const handleSaveApiKey = async () => {
    const trimmed = apiKeyInput.trim();
    if (!trimmed) {
      setApiKeyError("Informe a chave da SerpAPI.");
      return;
    }
    setApiKeyError("");
    try {
      await updateApiKeyMutation.mutateAsync({ apiKey: trimmed });
      setApiKeyInput("");
      queryClient.invalidateQueries({ queryKey: ["serpapi", "api-key"] });
      queryClient.invalidateQueries({ queryKey: ["serpapi", "api-keys"] });
      pushToast({ title: "Chave SerpAPI atualizada." });
    } catch {
      setApiKeyError("Nao foi possivel atualizar a chave. Tente novamente.");
    }
  };

  const handleSelectApiKey = async (apiKeyId: string) => {
    setApiKeyError("");
    try {
      await updateApiKeyMutation.mutateAsync({ apiKeyId });
      queryClient.invalidateQueries({ queryKey: ["serpapi", "api-key"] });
      queryClient.invalidateQueries({ queryKey: ["serpapi", "api-keys"] });
      pushToast({ title: "Chave SerpAPI selecionada." });
    } catch {
      setApiKeyError("Nao foi possivel selecionar a chave. Tente novamente.");
    }
  };

  useEffect(() => {
    const raw = localStorage.getItem(PRESET_STORAGE_KEY);
    if (!raw) return;
    try {
      const stored = JSON.parse(raw) as SerpapiPreset[];
      if (Array.isArray(stored)) {
        setPresets(stored);
      }
    } catch {
      setPresets([]);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presets));
  }, [presets]);

  useEffect(() => {
    if (!parsedFile) return;
    if (uploadMode === "niches" && parsedFile.headers.length === 1) {
      setSingleColumnNiche(true);
      setMapping((prev) => ({
        ...prev,
        niche: prev.niche || parsedFile.headers[0],
      }));
      return;
    }
    setSingleColumnNiche(false);
  }, [parsedFile, uploadMode]);

  const handleParseFile = async (file: File) => {
    setUploadError("");
    setIsParsing(true);
    try {
      const extension = file.name.split(".").pop()?.toLowerCase();
      let parsed: ParsedFile;
      if (extension === "csv") {
        const text = await file.text();
        parsed = parseCsvText(text);
      } else if (extension === "json") {
        const text = await file.text();
        parsed = parseJsonText(text);
      } else {
        throw new Error("unsupported_file");
      }
      if (parsed.rows.length > MAX_UPLOAD_ROWS) {
        throw new Error("too_many_rows");
      }
      if (!parsed.headers.length) {
        throw new Error("empty_file");
      }
      setParsedFile(parsed);
        setCityFixedInput("");
        setNicheFixedId("");
      const detectedMode = detectUploadMode(parsed.headers, parsed.headerless);
      setUploadMode(detectedMode);
      const guessed = parsed.headerless
        ? {
            name: "",
            phone: "",
            address: "",
            niche: "",
            city: "",
            source: "",
          }
        : guessMapping(parsed.headers);
      if (detectedMode === "niches" && parsed.headers.length === 1) {
        setSingleColumnNiche(true);
        setMapping({ ...guessed, niche: parsed.headers[0] });
      } else {
        setSingleColumnNiche(false);
        setMapping(guessed);
      }
    } catch (error) {
      setUploadError(
        error instanceof Error && error.message === "unsupported_file"
          ? "Formato nao suportado. Use CSV ou JSON."
          : error instanceof Error &&
              (error.message === "invalid_json" || error.message === "invalid_json_shape")
            ? "JSON invalido: esperado array de objetos."
            : error instanceof Error && error.message === "too_many_rows"
              ? `Arquivo muito grande: maximo de ${MAX_UPLOAD_ROWS} linhas.`
              : "Nao foi possivel ler o arquivo."
      );
      setParsedFile(null);
    } finally {
      setIsParsing(false);
    }
  };

  const handleFileSelect = (file: File | null) => {
    if (!file) return;
    if (file.size > MAX_UPLOAD_FILE_BYTES) {
      setUploadFile(null);
      setParsedFile(null);
      setUploadError(
        `Arquivo excede o limite de ${Math.floor(MAX_UPLOAD_FILE_BYTES / 1024 / 1024)}MB.`
      );
      return;
    }
    setUploadFile(file);
    void handleParseFile(file);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0] ?? null;
    handleFileSelect(file);
  };

  const handleManualImport = async () => {
    if (!parsedFile) return;
    const safeHeaders = parsedFile.headers.map((header, index) =>
      header?.trim() ? header : `col_${index + 1}`
    );
    if (uploadMode === "niches") {
      const header = singleColumnNiche ? parsedFile.headers[0] : mapping.niche;
      if (!header) {
        setUploadError("Selecione a coluna de nicho ou use lista simples.");
        return;
      }

      const rows = parsedFile.rows;
      const labels = Array.from(
        new Set(
          rows
            .map((row) => String(row[header] ?? "").trim())
            .filter((value) => value.length >= 2)
        )
      );

      if (!labels.length) {
        setUploadError("Nenhum nicho valido para importar.");
        return;
      }

      try {
        const result = await nicheBulkMutation.mutateAsync({ labels });
        pushToast({
          type: "success",
          title: "Nichos importados",
          message: `${result.created} novos / ${result.existing} existentes`,
        });
        queryClient.invalidateQueries({ queryKey: ["catalog", "niches"] });
        queryClient.invalidateQueries({ queryKey: ["serpapi", "niches"] });
        queryClient.invalidateQueries({ queryKey: ["serpapi", "metrics"] });
      } catch {
        setUploadError("Nao foi possivel importar os nichos.");
      }
      return;
    }
    if (!uploadOptions.dryRun && !mapping.city && !resolvedFixedCityId) {
      setUploadError("Selecione uma cidade fixa ou mapeie a coluna de cidade.");
      return;
    }
    if (!mapping.name) {
      setUploadError("Mapeie a coluna de nome.");
      return;
    }
    if (uploadMode === "niches_companies" && !mapping.niche) {
      setUploadError("Mapeie a coluna de nicho.");
      return;
    }
    if (!uploadOptions.dryRun && !mapping.niche && !nicheFixedId) {
      setUploadError("Selecione um nicho fixo ou mapeie a coluna de nicho.");
      return;
    }
    if (!uploadOptions.dryRun && mapping.niche && hasEmptyNiche) {
      setUploadError(
        `Existem ${nicheEmptyCount} linhas com nicho vazio. Corrija antes de importar.`
      );
      return;
    }

    const buildRows = () => {
      if (!uploadOptions.cleanSpecialChars) {
        return parsedFile.rows;
      }
      return parsedFile.rows.map((row) => {
        const next = { ...row };
        (["name", "phone", "address", "city", "niche", "source"] as const).forEach((key) => {
          const header = mapping[key];
          if (!header) {
            return;
          }
          const raw = row[header] ?? "";
          next[header] = cleanUploadValue(key, String(raw), uploadOptions.cleanSpecialChars);
        });
        return next;
      });
    };

    const rows = buildRows().filter((row) =>
      Object.values(row).some((value) => value && value.toString().trim().length > 0)
    );

    if (!rows.length) {
      setUploadError("Nenhuma linha valida para importar.");
      return;
    }
    const safeRows = coerceRowsToStrings(rows, safeHeaders);

    try {
      const result = await manualImportMutation.mutateAsync({
        rows: safeRows,
        mapping: {
          name: mapping.name || undefined,
          phone: mapping.phone || undefined,
          address: mapping.address || undefined,
          city: mapping.city || undefined,
          niche: mapping.niche || undefined,
          source: mapping.source || undefined,
        },
        fixedCityId: !mapping.city ? resolvedFixedCityId || null : null,
        fixedNicheId: !mapping.niche ? nicheFixedId || null : null,
        options: {
          dryRun: uploadOptions.dryRun,
          ignoreDuplicates: uploadOptions.ignoreDuplicates,
          updateExisting: uploadOptions.updateExisting,
        },
      });
      if (result?.runId) {
        pushToast({
          type: "success",
          title: "Importacao criada",
          message: `RUN ${result.runId}`,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["serpapi", "runs"] });
      queryClient.invalidateQueries({ queryKey: ["serpapi", "niches"] });
      queryClient.invalidateQueries({ queryKey: ["serpapi", "metrics"] });
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const data = error.response?.data as { message?: string } | undefined;
        setUploadError(data?.message ?? "Nao foi possivel importar o arquivo.");
      } else {
        setUploadError("Nao foi possivel importar o arquivo.");
      }
    }
  };

  const handleExportFiltered = async () => {
    setIsExporting(true);
    try {
      const periodDays = periodOptions.find((opt) => opt.value === periodFilter)?.days ?? null;
      const params = {
        periodDays: periodDays ?? undefined,
        cityId: cityFilter !== "all" ? cityFilter : undefined,
        nicheId: nicheFilter !== "all" ? nicheFilter : undefined,
      };
      const response = await apiClient.get("/admin/serpapi/export-filtered", { params });
      const rows = (response.data ?? []) as Array<Record<string, unknown>>;
      const filenameBase = `serpapi-encontrados-${periodFilter}`;

      if (exportFormat === "json") {
        const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${filenameBase}.json`;
        link.click();
        URL.revokeObjectURL(url);
        return;
      }

      const headers = rows.length ? Object.keys(rows[0]) : [];
      const escapeValue = (value: unknown) => {
        const raw = value === null || value === undefined ? "" : String(value);
        return `"${raw.replace(/"/g, "\"\"")}"`;
      };
      const lines = [
        headers.join(","),
        ...rows.map((row) => headers.map((header) => escapeValue(row[header])).join(",")),
      ];
      const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${filenameBase}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

  const downloadCsv = async (
    url: string,
    filename: string,
    setLoading: (value: boolean) => void,
    params?: Record<string, string>
  ) => {
    setLoading(true);
    try {
      const response = await apiClient.get(url, { responseType: "blob", params });
      const blob = new Blob([response.data], { type: "text/csv" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      URL.revokeObjectURL(link.href);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllRecordsForRun = async (runId: string) => {
    const limit = 100;
    let offset = 0;
    const all: CompareRecord[] = [];
    while (true) {
      const response = await apiClient.get(`/admin/serpapi/runs/${runId}/records`, {
        params: { limit, offset },
      });
      const payload = response.data as { items: CompareRecord[]; total: number };
      const items = payload?.items ?? [];
      all.push(...items);
      offset += limit;
      if (all.length >= (payload?.total ?? 0) || items.length < limit) {
        break;
      }
    }
    return all;
  };

  const handleCompareRuns = async () => {
    if (!compareRunA || !compareRunB || compareRunA === compareRunB) {
      setCompareError("Selecione duas execucoes diferentes.");
      return;
    }
    setCompareError("");
    setIsComparing(true);
    try {
      const [left, right] = await Promise.all([
        fetchAllRecordsForRun(compareRunA),
        fetchAllRecordsForRun(compareRunB),
      ]);

      const buildKey = (record: CompareRecord) => record.dedupeKey ?? record.id;
      const leftMap = new Map<string, CompareRecord>();
      left.forEach((record) => leftMap.set(buildKey(record), record));
      const rightMap = new Map<string, CompareRecord>();
      right.forEach((record) => rightMap.set(buildKey(record), record));

      const added: CompareRecord[] = [];
      const removed: CompareRecord[] = [];
      const changed: Array<{ before: CompareRecord; after: CompareRecord }> = [];

      for (const [key, record] of rightMap.entries()) {
        const previous = leftMap.get(key);
        if (!previous) {
          added.push(record);
        } else if (
          previous.status !== record.status ||
          (previous.rawPreview ?? "") !== (record.rawPreview ?? "")
        ) {
          changed.push({ before: previous, after: record });
        }
      }

      for (const [key, record] of leftMap.entries()) {
        if (!rightMap.has(key)) {
          removed.push(record);
        }
      }

      setCompareResult({ added, removed, changed });
    } catch {
      setCompareError("Nao foi possivel comparar as execucoes.");
    } finally {
      setIsComparing(false);
    }
  };

  const handleRerun = async (runId: string, dryRun: boolean) => {
    const run = latestRuns.find((item) => item.id === runId);
    if (!run || !run.cityId || !run.nicheId) {
      return;
    }
    setActiveRunAction(runId);
    try {
      await importMutation.mutateAsync(
        {
          cityId: run.cityId,
          nicheId: run.nicheId,
          query: run.query ?? undefined,
          limit: run.found > 0 ? run.found : undefined,
          dryRun,
        },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["serpapi", "runs"] });
          },
        }
      );
    } finally {
      setActiveRunAction(null);
    }
  };

  const handleInvalidate = async (runId: string) => {
    setActiveRunAction(runId);
    try {
      await invalidateMutation.mutateAsync(
        { runId },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["serpapi", "runs"] });
          },
        }
      );
    } finally {
      setActiveRunAction(null);
    }
  };

  const handlePublishRun = async (runId: string) => {
    setActiveRunAction(runId);
    try {
      const result = await publishRunMutation.mutateAsync({ runId });
      pushToast({
        type: "success",
        title: "Publicacao concluida",
        message: `Inseridos ${result.inserted} • Dedupe ${result.deduped} • Erros ${result.skipped}`,
      });
      queryClient.invalidateQueries({ queryKey: ["serpapi", "runs"] });
      queryClient.invalidateQueries({ queryKey: ["serpapi", "niches"] });
      if (isNicheModalOpen && selectedNicheId) {
        queryClient.invalidateQueries({
          queryKey: ["serpapi", "niches", selectedNicheId, "companies"],
        });
      }
    } finally {
      setActiveRunAction(null);
    }
  };

  const handleSavePreset = () => {
    if (!presetName.trim() || !form.cityId || !form.nicheId) {
      return;
    }
    const nextPreset: SerpapiPreset = {
      id: crypto.randomUUID(),
      name: presetName.trim(),
      cityId: form.cityId,
      nicheId: form.nicheId,
      query: form.query,
      limit: form.limit,
      autoRun: presetAutoRun,
      runOnChangeOnly: presetRunOnChangeOnly,
      createdAt: new Date().toISOString(),
    };
    setPresets((prev) => [nextPreset, ...prev]);
    setPresetName("");
    setPresetAutoRun(false);
    setPresetRunOnChangeOnly(false);
  };

  const handleApplyPreset = (preset: SerpapiPreset) => {
    setForm((prev) => ({
      ...prev,
      cityId: preset.cityId,
      nicheId: preset.nicheId,
      query: preset.query,
      limit: preset.limit,
    }));
  };

  const handleDeletePreset = (presetId: string) => {
    setPresets((prev) => prev.filter((item) => item.id !== presetId));
  };

  return (
    <div className="space-y-10 pb-10">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Central SerpAPI</h1>
            <p className="text-sm text-slate-600">
              Orquestre coletas, acompanhe execucoes e trate conflitos com mais contexto.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline">
              <Link to="/admin/serpapi/conflicts">Conflitos</Link>
            </Button>
            <Button
              variant="outline"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["serpapi", "runs"] })}
            >
              Atualizar
            </Button>
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Impacto das coletas</h2>
            <p className="text-sm text-slate-600">
              Totais do banco (all time). Filtros afetam apenas exportacoes e execucoes.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm focus:border-slate-300 focus:outline-none"
              value={periodFilter}
              onChange={(event) => setPeriodFilter(event.target.value as typeof periodFilter)}
            >
              {periodOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm focus:border-slate-300 focus:outline-none"
              value={cityFilter}
              onChange={(event) => setCityFilter(event.target.value)}
            >
              <option value="all">Todas as cidades</option>
              {(citiesQuery.data ?? []).map((city) => (
                <option key={city.id} value={city.id}>
                  {city.name} / {city.state}
                </option>
              ))}
            </select>
            <select
              className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm focus:border-slate-300 focus:outline-none"
              value={nicheFilter}
              onChange={(event) => setNicheFilter(event.target.value)}
            >
              <option value="all">Todos os nichos</option>
              {(catalogNichesQuery.data ?? []).map((niche) => (
                <option key={niche.id} value={niche.id}>
                  {niche.label}
                </option>
              ))}
            </select>
            <select
              className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm focus:border-slate-300 focus:outline-none"
              value={exportFormat}
              onChange={(event) => setExportFormat(event.target.value as typeof exportFormat)}
            >
              <option value="csv">CSV</option>
              <option value="json">JSON</option>
            </select>
            <Button onClick={() => void handleExportFiltered()} disabled={isExporting}>
              {isExporting ? "Baixando..." : "Baixar encontrados (filtrado)"}
            </Button>
          </div>
        </div>

        {metricsQuery.isError ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
            Nao foi possivel carregar os totais do banco. Tente atualizar novamente.
          </div>
        ) : metricsQuery.isLoading ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
            Carregando totais do banco...
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Empresas no banco"
              value={allTimeMetrics.totalCompanies.toLocaleString("pt-BR")}
            />
            <MetricCard
              label="Nichos no banco"
              value={allTimeMetrics.totalNiches.toLocaleString("pt-BR")}
            />
            <MetricCard
              label="Cidades no banco"
              value={allTimeMetrics.totalCities.toLocaleString("pt-BR")}
            />
            <MetricCard
              label="Custo estimado SerpAPI"
              value={`US$ ${allTimeMetrics.cost.toFixed(2)}`}
              helper="Estimado pelo total de empresas."
            />
            <MetricCard
              label="Custo medio por empresa"
              value={`US$ ${allTimeMetrics.averageCost.toFixed(2)}`}
              helper="Media considerando o total de empresas."
            />
            <MetricCard label="Cidade mais produtiva" value={allTimeMetrics.topCity} />
            <MetricCard label="Nicho mais produtivo" value={allTimeMetrics.topNiche} />
          </div>
        )}
      </section>

      <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Upload de dados</h2>
          <p className="text-sm text-slate-600">
            Envie CSV ou JSON, revise a primeira pagina e mapeie colunas antes de importar.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="space-y-4">
            <div
              className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center"
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
            >
              <p className="text-sm font-semibold text-slate-800">
                Arraste o arquivo aqui ou clique para selecionar
              </p>
              <p className="text-xs text-slate-500">Formatos aceitos: CSV, JSON</p>
              <input
                type="file"
                accept=".csv,.json"
                onChange={(event) => handleFileSelect(event.target.files?.[0] ?? null)}
                className="hidden"
                id="serpapi-upload-input"
              />
              <label htmlFor="serpapi-upload-input">
                <span className="cursor-pointer rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm">
                  Selecionar arquivo
                </span>
              </label>
              {uploadFile ? (
                <p className="text-xs text-slate-500">
                  {uploadFile.name} ({Math.round(uploadFile.size / 1024)} KB)
                </p>
              ) : null}
              {isParsing ? <p className="text-xs text-slate-500">Processando arquivo...</p> : null}
              {uploadError ? <p className="text-xs text-rose-600">{uploadError}</p> : null}
            </div>

            {parsedFile ? (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-4 py-3">
                  <p className="text-sm font-semibold text-slate-900">Preview (pagina 1)</p>
                  <p className="text-xs text-slate-500">
                    Mostrando {Math.min(previewRows.length, PREVIEW_ROWS)} linhas.
                  </p>
                  {parsedFile.headerless ? (
                    <p className="mt-1 text-xs text-amber-600">
                      Cabecalho nao identificado. Revise o mapeamento manualmente.
                    </p>
              ) : null}

              {parsedFile && uploadReport ? (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  <div className="border-b border-slate-100 px-4 py-3">
                    <p className="text-sm font-semibold text-slate-900">Relatorio de leitura</p>
                    <p className="text-xs text-slate-500">Resumo do arquivo importado.</p>
                  </div>
                  <div className="space-y-4 px-4 py-4">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-xl bg-slate-50 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500">
                          Total de linhas
                        </p>
                        <p className="text-sm font-semibold text-slate-900">
                          {uploadReport.totalRows}
                        </p>
                      </div>
                      <div className="rounded-xl bg-slate-50 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500">
                          Headers detectados
                        </p>
                        <p className="text-sm font-semibold text-slate-900">
                          {uploadReport.headers.length}
                        </p>
                      </div>
                      <div className="rounded-xl bg-slate-50 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500">
                          Nichos distintos
                        </p>
                        <p className="text-sm font-semibold text-slate-900">
                          {hasNicheMapping ? uploadReport.nicheDistinctCount : "--"}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-slate-600">Headers detectados</p>
                      <div className="flex flex-wrap gap-2">
                        {uploadReport.headers.map((header) => (
                          <span
                            key={header}
                            className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-700"
                          >
                            {header}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-slate-600">Top 10 nichos</p>
                      {!hasNicheMapping ? (
                        <p className="text-xs text-slate-500">
                          Mapeie a coluna de nicho para ver a distribuicao.
                        </p>
                      ) : uploadReport.topNiches.length ? (
                        <ul className="grid gap-1 text-xs text-slate-600">
                          {uploadReport.topNiches.map((item) => (
                            <li key={item.label} className="flex items-center justify-between">
                              <span>{item.label}</span>
                              <span className="font-semibold text-slate-700">{item.count}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-slate-500">Sem nichos detectados.</p>
                      )}
                      {hasNicheMapping ? (
                        <p className={`text-xs ${hasEmptyNiche ? "text-rose-600" : "text-slate-500"}`}>
                          Nicho vazio: {nicheEmptyCount}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
                <div className="overflow-auto">
                  <table className="min-w-full text-left text-xs">
                    <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                      <tr>
                        {parsedFile.headers.map((header) => (
                          <th
                            key={header}
                            className={`px-3 py-2 font-semibold ${
                              mappedHeaders.has(header) ? "bg-amber-50 text-amber-700" : ""
                            }`}
                          >
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, index) => (
                        <tr key={index} className="border-b border-slate-100">
                          {parsedFile.headers.map((header) => (
                            <td
                              key={`${index}-${header}`}
                              className={`px-3 py-2 text-slate-700 ${
                                mappedHeaders.has(header) ? "bg-amber-50" : ""
                              }`}
                            >
                              {row[header] || "--"}
                            </td>
                          ))}
                        </tr>
                      ))}
                      {!previewRows.length ? (
                        <tr>
                          <td
                            colSpan={parsedFile.headers.length || 1}
                            className="px-3 py-6 text-center text-sm text-slate-500"
                          >
                            Nenhum dado encontrado na primeira pagina.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>

          <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">Mapeamento de colunas</p>
              <p className="text-xs text-slate-500">
                Escolha quais colunas alimentam cada campo do pipeline.
              </p>
            </div>

            {parsedFile ? (
              <div className="space-y-3">
                <label className="text-xs font-semibold text-slate-600">
                  O que voce esta importando?
                  <select
                    className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-300 focus:outline-none"
                    value={uploadMode}
                    onChange={(event) => setUploadMode(event.target.value as UploadMode)}
                  >
                    {UPLOAD_MODE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                {mappingFields.map((field) => (
                  <label key={field.key} className="text-xs font-semibold text-slate-600">
                    {field.label}
                    <select
                      className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-300 focus:outline-none"
                      value={mapping[field.key]}
                      onChange={(event) =>
                        setMapping((prev) => ({ ...prev, [field.key]: event.target.value }))
                      }
                    >
                      <option value="">Nao mapear</option>
                      {parsedFile.headers.map((header) => (
                        <option key={header} value={header}>
                          {header}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}

                {uploadMode === "niches" && parsedFile.headers.length === 1 ? (
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={singleColumnNiche}
                      onChange={(event) => setSingleColumnNiche(event.target.checked)}
                    />
                    Arquivo e lista simples (1 coluna)
                  </label>
                ) : null}

                {uploadMode === "niches" || !mapping.city ? (
                  <label className="text-xs font-semibold text-slate-600">
                      Cidade fixa do upload{" "}
                      {requiresCity && !uploadOptions.dryRun ? "(obrigatorio)" : "(opcional)"}
                    <Input
                      className="mt-1"
                      value={cityFixedInput}
                      onChange={(event) => setCityFixedInput(event.target.value)}
                      placeholder="Ex: Itapetininga ou Itapetininga - SP"
                    />
                    {cityFixedInput && !resolvedFixedCityId ? (
                      <span className="mt-1 block text-[11px] text-rose-600">
                        Cidade nao encontrada. Use o nome da cidade ou Nome - UF.
                      </span>
                    ) : null}
                    {missingFixedCity && !uploadOptions.dryRun ? (
                      <span className="mt-1 block text-[11px] text-rose-600">
                        Cidade fixa obrigatoria para importar sem dry run.
                      </span>
                    ) : null}
                  </label>
                ) : null}

                {uploadMode === "companies" && !mapping.niche ? (
                  <label className="text-xs font-semibold text-slate-600">
                    Nicho fixo do upload
                    <select
                      className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-300 focus:outline-none"
                      value={nicheFixedId}
                      onChange={(event) => setNicheFixedId(event.target.value)}
                    >
                      <option value="">Selecionar nicho</option>
                      {(catalogNichesQuery.data ?? []).map((niche) => (
                        <option key={niche.id} value={niche.id}>
                          {niche.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                {extractedCities.length && !mapping.city && requiresCity ? (
                  <p className="text-xs text-slate-500">
                    {extractedCities.length} cidades detectadas no arquivo. Mapeie a coluna de
                    cidade ou escolha uma cidade fixa.
                  </p>
                ) : null}

                {uploadMode !== "niches" ? (
                  <label className="text-xs font-semibold text-slate-600">
                    Fonte
                    <select
                      className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-300 focus:outline-none"
                      value={sourceFixedValue}
                      onChange={(event) => setSourceFixedValue(event.target.value)}
                    >
                      <option value="">Nao usar</option>
                      {SOURCE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                Envie um arquivo para liberar o mapeamento.
              </p>
            )}

            <div className="space-y-2 pt-2">
              <p className="text-xs font-semibold text-slate-600">Opcoes</p>
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={uploadOptions.ignoreDuplicates}
                  onChange={(event) =>
                    setUploadOptions((prev) => ({ ...prev, ignoreDuplicates: event.target.checked }))
                  }
                />
                Ignorar duplicados
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={uploadOptions.cleanSpecialChars}
                  onChange={(event) =>
                    setUploadOptions((prev) => ({
                      ...prev,
                      cleanSpecialChars: event.target.checked,
                    }))
                  }
                />
                Limpar os dados de upload
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={uploadOptions.updateExisting}
                  onChange={(event) =>
                    setUploadOptions((prev) => ({ ...prev, updateExisting: event.target.checked }))
                  }
                />
                Atualizar registros existentes
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={uploadOptions.dryRun}
                  onChange={(event) =>
                    setUploadOptions((prev) => ({ ...prev, dryRun: event.target.checked }))
                  }
                />
                Dry run (simulacao sem gravar)
              </label>
              {!uploadOptions.dryRun && hasEmptyNiche ? (
                <p className="text-xs text-rose-600">
                  Existem {nicheEmptyCount} linhas com nicho vazio. Corrija antes de importar.
                </p>
              ) : null}
            </div>

            <Button
              onClick={() => void handleManualImport()}
              disabled={!parsedFile || isManualImporting || shouldBlockImport}
            >
              {isManualImporting ? "Importando..." : "Importar dados"}
            </Button>
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Nova coleta</h2>
          <p className="text-sm text-slate-600">Defina cidade, nicho e termos extras antes de iniciar.</p>
        </div>
        <form className="grid gap-6 lg:grid-cols-[2fr_1fr]" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm text-slate-600">
              Cidade
              <select
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-300 focus:outline-none"
                value={form.cityId}
                onChange={(event) => setForm((prev) => ({ ...prev, cityId: event.target.value }))}
                disabled={citiesQuery.isLoading}
              >
                <option value="">Selecione</option>
                {(citiesQuery.data ?? []).map((city) => (
                  <option key={city.id} value={city.id}>
                    {city.name} / {city.state}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-slate-600">
              Nicho
              <Input
                className="mt-1"
                value={nicheLookup}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setNicheLookup(nextValue);
                  const match = nicheLookupResults.find(
                    (niche) => niche.label.toLowerCase() === nextValue.trim().toLowerCase()
                  );
                  setForm((prev) => ({ ...prev, nicheId: match?.id ?? "" }));
                }}
                placeholder="Digite 3 letras para buscar"
                list="niche-lookup-list"
              />
              {nicheLookup.trim().length >= 3 ? (
                <datalist id="niche-lookup-list">
                  {nicheLookupResults.map((niche) => (
                    <option key={niche.id} value={niche.label} />
                  ))}
                </datalist>
              ) : null}
            </label>
            <label className="text-sm text-slate-600 md:col-span-2">
              Query adicional
              <Input
                className="mt-1"
                value={form.query}
                onChange={(event) => setForm((prev) => ({ ...prev, query: event.target.value }))}
                placeholder="Ex: pizzaria em Sorocaba"
              />
            </label>
            <label className="text-sm text-slate-600">
              Limit
              <Input
                className="mt-1"
                type="number"
                value={form.limit}
                min={1}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, limit: Number(event.target.value) }))
                }
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={form.dryRun}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, dryRun: event.target.checked }))
                }
              />
              Dry run
            </label>
          </div>

          <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Custo estimado SerpAPI</p>
              <p className="text-2xl font-bold text-slate-900">US$ {estimatedCost.toFixed(2)}</p>
              <p className="text-xs text-slate-500">Baseado em {limitValue} resultados estimados.</p>
            </div>

            {isHighLimit ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Limite alto detectado. Revise o custo e o tempo antes de iniciar a coleta.
              </div>
            ) : null}

            <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Chave SerpAPI
                </p>
                <span className="text-[11px] text-slate-500">
                  {apiKeyStatusQuery.data?.isConfigured ? "Configurada" : "Nao configurada"}
                </span>
              </div>
              <Input
                className="mt-2"
                type="password"
                autoComplete="current-password"
                value={apiKeyInput}
                onChange={(event) => {
                  setApiKeyInput(event.target.value);
                  if (apiKeyError) setApiKeyError("");
                }}
                placeholder="Cole sua chave SerpAPI"
              />
              <div className="mt-2 space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Selecao rapida
                </p>
                {apiKeysQuery.isLoading ? (
                  <p className="text-xs text-slate-500">Carregando chaves...</p>
                ) : apiKeysQuery.data?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {apiKeysQuery.data.map((apiKey) => (
                      <Button
                        key={apiKey.id}
                        type="button"
                        size="sm"
                        variant={apiKey.isActive ? "primary" : "outline"}
                        onClick={() => handleSelectApiKey(apiKey.id)}
                        disabled={apiKey.isActive || updateApiKeyMutation.isPending}
                      >
                        {apiKey.label ? `${apiKey.label} (${apiKey.masked})` : apiKey.masked}
                      </Button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">Nenhuma chave salva ainda.</p>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleSaveApiKey}
                  disabled={updateApiKeyMutation.isPending}
                >
                  {updateApiKeyMutation.isPending ? "Salvando..." : "Atualizar chave"}
                </Button>
                {apiKeyStatusQuery.data?.updatedAt ? (
                  <span className="text-[11px] text-slate-500">
                    Atualizada {formatDateTime(apiKeyStatusQuery.data.updatedAt)}
                  </span>
                ) : null}
              </div>
              {apiKeyError ? <p className="mt-2 text-xs text-rose-600">{apiKeyError}</p> : null}
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={isImporting || !form.cityId || !form.nicheId}
            >
              {isImporting ? "Iniciando..." : "Iniciar coleta"}
            </Button>
          </div>
        </form>

        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-900">Salvar preset</p>
              <p className="text-xs text-slate-500">
                Guarde combinacoes de cidade, nicho, query e limite para reutilizar.
              </p>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="text-xs font-semibold text-slate-600 md:col-span-2">
                Nome do preset
                <Input
                  className="mt-1"
                  value={presetName}
                  onChange={(event) => setPresetName(event.target.value)}
                  placeholder="Ex: Sao Paulo - Clinicas (150)"
                />
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={presetAutoRun}
                  onChange={(event) => setPresetAutoRun(event.target.checked)}
                />
                Rodar automaticamente (futuro)
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={presetRunOnChangeOnly}
                  onChange={(event) => setPresetRunOnChangeOnly(event.target.checked)}
                />
                Rodar somente se houver mudanca
              </label>
              <Button
                type="button"
                className="md:col-span-2"
                onClick={handleSavePreset}
                disabled={!presetName.trim() || !form.cityId || !form.nicheId}
              >
                Salvar preset
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-900">Presets salvos</p>
              <p className="text-xs text-slate-500">Clique para aplicar ou gerencie seus presets.</p>
            </div>
            <div className="mt-4 space-y-3">
              {presets.length === 0 ? (
                <p className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3 text-xs text-slate-500">
                  Nenhum preset salvo ainda.
                </p>
              ) : (
                presets.map((preset) => (
                  <div
                    key={preset.id}
                    className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{preset.name}</p>
                        <p className="text-xs text-slate-500">
                          {preset.cityId} - {preset.nicheId}
                        </p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => handleDeletePreset(preset.id)}>
                        Remover
                      </Button>
                    </div>
                    <p className="text-xs text-slate-600">Query: {preset.query || "--"}</p>
                    <p className="text-xs text-slate-600">Limite: {preset.limit}</p>
                    <div className="flex flex-wrap gap-2">
                      {preset.autoRun ? (
                        <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-700">
                          Auto-run
                        </span>
                      ) : null}
                      {preset.runOnChangeOnly ? (
                        <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-700">
                          Somente mudancas
                        </span>
                      ) : null}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handleApplyPreset(preset)}>
                        Aplicar
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-slate-900">Execucoes recentes</h2>
            <p className="text-sm text-slate-600">
              Veja o andamento das ultimas importacoes e avance para os detalhes.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setRunsPage((prev) => Math.max(1, prev - 1))}
              disabled={!canPrevRunsPage || isLoadingRuns}
            >
              Anterior
            </Button>
            <span className="text-xs font-semibold text-slate-500">Pagina {runsPage}</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setRunsPage((prev) => prev + 1)}
              disabled={!canNextRunsPage || isLoadingRuns}
            >
              Proxima
            </Button>
          </div>
        </div>

        {isLoadingRuns ? (
          <div className="rounded-2xl bg-slate-50 px-4 py-6 text-sm text-slate-600">
            Carregando execucoes...
          </div>
        ) : hasRunsError ? (
          <div className="rounded-2xl bg-amber-50 px-4 py-6 text-sm text-amber-800">
            Nao foi possivel carregar as execucoes.
            <Button
              variant="outline"
              size="sm"
              className="ml-3"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["serpapi", "runs"] })}
            >
              Tentar novamente
            </Button>
          </div>
        ) : recentRuns.length === 0 ? (
          <div className="rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
            Nenhuma execucao registrada ate o momento.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {recentRuns.map((run) => (
              (() => {
                const previousRun = findPreviousRun(run.id);
                const processed = run.inserted + run.updated + run.conflicts + run.errors;
                const progress =
                  run.found > 0 ? Math.min(100, Math.round((processed / run.found) * 100)) : 0;
                const diff = previousRun
                  ? {
                      found: run.found - previousRun.found,
                      inserted: run.inserted - previousRun.inserted,
                      conflicts: run.conflicts - previousRun.conflicts,
                      cost:
                        run.found * SERPAPI_COST_PER_RESULT_USD -
                        previousRun.found * SERPAPI_COST_PER_RESULT_USD,
                    }
                  : null;
                const isActionRunning = activeRunAction === run.id;
                const isManualRun = run.query === "manual_upload";
                const canRerun = Boolean(run.cityId && run.nicheId);
                return (
                  <div key={run.id} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-xs uppercase tracking-wide text-slate-500">Execucao</p>
                        <p className="font-mono text-sm text-slate-700">{run.id.slice(0, 8)}</p>
                        <p className="text-sm font-semibold text-slate-900">
                          {run.cityId ?? "--"} - {run.nicheId ?? "--"}
                        </p>
                        <p className="text-xs text-slate-500">Fonte: {resolveSourceLabel(run.query)}</p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        {statusBadge(run.status)}
                        <p className="text-xs text-slate-500">
                          Tempo: {formatDuration(run.createdAt, run.finishedAt)}
                        </p>
                      </div>
                    </div>

                    {run.status === "running" && run.found > 0 ? (
                      <div className="space-y-2">
                        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-2 rounded-full bg-emerald-500 transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <p className="text-xs text-slate-500">
                          Progresso: {processed}/{run.found} ({progress}%)
                        </p>
                      </div>
                    ) : null}

                    <div className="grid gap-2 text-sm text-slate-600">
                      <div className="flex items-center justify-between">
                        <span>Criado em</span>
                        <span className="font-medium text-slate-800">{formatDateTime(run.createdAt)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Finalizado</span>
                        <span className="font-medium text-slate-800">{formatDateTime(run.finishedAt)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Query</span>
                        <span className="max-w-[160px] truncate text-right font-medium text-slate-800">
                          {run.query ?? "--"}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <MetricPill label="Encontrados" value={run.found} />
                      <MetricPill label="Inseridos" value={run.inserted} />
                      <MetricPill label="Atualizados" value={run.updated} />
                      <MetricPill label="Conflitos" value={run.conflicts} />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {isManualRun ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handlePublishRun(run.id)}
                          disabled={isActionRunning || publishRunMutation.isPending}
                        >
                          Publicar
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        onClick={() => handleRerun(run.id, false)}
                        disabled={!canRerun || isActionRunning}
                      >
                        Reexecutar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRerun(run.id, true)}
                        disabled={!canRerun || isActionRunning}
                      >
                        Reexecutar dry-run
                      </Button>
                      <Button asChild size="sm" variant="ghost">
                        <a href={`/admin/serpapi/export?runId=${run.id}&type=records`} target="_blank" rel="noreferrer">
                          Exportar
                        </a>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setDiffOpenRunId((prev) => (prev === run.id ? null : run.id))
                        }
                        disabled={!previousRun}
                      >
                        Ver diferencas
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleInvalidate(run.id)}
                        disabled={isActionRunning}
                      >
                        Invalidar
                      </Button>
                      <Button asChild variant="outline" size="sm">
                        <Link to={`/admin/serpapi/runs/${run.id}`}>Abrir detalhes</Link>
                      </Button>
                    </div>

                    {diffOpenRunId === run.id && diff ? (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                        <p>
                          Diferenca vs execucao anterior: encontrados {diff.found >= 0 ? "+" : ""}
                          {diff.found}, novos {diff.inserted >= 0 ? "+" : ""}
                          {diff.inserted}, conflitos {diff.conflicts >= 0 ? "+" : ""}
                          {diff.conflicts}, custo US$ {diff.cost.toFixed(2)}.
                        </p>
                      </div>
                    ) : null}
                  </div>
                );
              })()
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-slate-900">Diagnostico automatico da coleta</h2>
          <p className="text-sm text-slate-600">
            Insights baseados apenas em estatistica dos filtros atuais.
          </p>
        </div>
        {diagnostics.length === 0 ? (
          <div className="rounded-2xl bg-slate-50 px-4 py-5 text-sm text-slate-600">
            Sem dados suficientes para gerar diagnosticos.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {diagnostics.map((insight) => {
              const toneClass =
                insight.tone === "warning"
                  ? "border-amber-200 bg-amber-50 text-amber-900"
                  : insight.tone === "positive"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : "border-slate-200 bg-slate-50 text-slate-900";
              return (
                <div key={insight.title} className={`rounded-2xl border px-4 py-4 ${toneClass}`}>
                  <p className="text-xs uppercase tracking-wide text-slate-500">{insight.title}</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{insight.detail}</p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Comparar execucoes</h2>
            <p className="text-sm text-slate-600">
              Compare duas execucoes para enxergar evolucao real.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm focus:border-slate-300 focus:outline-none"
              value={compareRunA}
              onChange={(event) => setCompareRunA(event.target.value)}
            >
              <option value="">Execucao A</option>
              {sortedRuns.map((run) => (
                <option key={run.id} value={run.id}>
                  {run.id.slice(0, 8)} - {formatDateTime(run.createdAt)}
                </option>
              ))}
            </select>
            <select
              className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm focus:border-slate-300 focus:outline-none"
              value={compareRunB}
              onChange={(event) => setCompareRunB(event.target.value)}
            >
              <option value="">Execucao B</option>
              {sortedRuns.map((run) => (
                <option key={run.id} value={run.id}>
                  {run.id.slice(0, 8)} - {formatDateTime(run.createdAt)}
                </option>
              ))}
            </select>
            <Button onClick={() => void handleCompareRuns()} disabled={isComparing}>
              {isComparing ? "Comparando..." : "Comparar execucoes"}
            </Button>
          </div>
        </div>

        {compareError ? (
          <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {compareError}
          </div>
        ) : null}

        {compareResult ? (
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-xs uppercase tracking-wide text-emerald-700">+ Empresas novas</p>
              <p className="mt-2 text-2xl font-bold text-emerald-900">
                {compareResult.added.length}
              </p>
              <ul className="mt-3 space-y-2 text-xs text-emerald-800">
                {compareResult.added.slice(0, 6).map((record) => (
                  <li key={record.id}>{recordDisplayLabel(record)}</li>
                ))}
                {compareResult.added.length > 6 ? (
                  <li>+ {compareResult.added.length - 6} outros</li>
                ) : null}
              </ul>
            </div>
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
              <p className="text-xs uppercase tracking-wide text-rose-700">- Empresas removidas</p>
              <p className="mt-2 text-2xl font-bold text-rose-900">
                {compareResult.removed.length}
              </p>
              <ul className="mt-3 space-y-2 text-xs text-rose-800">
                {compareResult.removed.slice(0, 6).map((record) => (
                  <li key={record.id}>{recordDisplayLabel(record)}</li>
                ))}
                {compareResult.removed.length > 6 ? (
                  <li>+ {compareResult.removed.length - 6} outros</li>
                ) : null}
              </ul>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs uppercase tracking-wide text-amber-700">~ Empresas alteradas</p>
              <p className="mt-2 text-2xl font-bold text-amber-900">
                {compareResult.changed.length}
              </p>
              <ul className="mt-3 space-y-2 text-xs text-amber-800">
                {compareResult.changed.slice(0, 6).map((pair) => (
                  <li key={pair.after.id}>{recordDisplayLabel(pair.after)}</li>
                ))}
                {compareResult.changed.length > 6 ? (
                  <li>+ {compareResult.changed.length - 6} outros</li>
                ) : null}
              </ul>
            </div>
          </div>
        ) : null}
      </section>

      <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Distribuicao de Empresas Coletadas</h2>
            <p className="text-sm text-slate-600">
              Empresas coletadas por nicho de negocio - clique para visualizar
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={() =>
                downloadCsv(
                  "/admin/serpapi/export/niches",
                  "serpapi_niches.csv",
                  setIsNicheExporting,
                  nicheSearch.trim() ? { query: nicheSearch.trim() } : undefined
                )
              }
              disabled={isNicheExporting}
            >
              {isNicheExporting ? "Baixando..." : "Baixar Nichos"}
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                downloadCsv(
                  "/admin/serpapi/export/companies",
                  selectedNicheId ? `serpapi_companies_${selectedNicheId}.csv` : "serpapi_companies.csv",
                  setIsCompanyExporting,
                  selectedNicheId ? { nicheId: selectedNicheId } : undefined
                )
              }
              disabled={isCompanyExporting}
            >
              {isCompanyExporting ? "Baixando..." : "Baixar Empresas"}
            </Button>
            <Button
              variant="outline"
              onClick={() => downloadCsv("/admin/serpapi/export/full", "serpapi_full.csv", setIsFullExporting)}
              disabled={isFullExporting}
            >
              {isFullExporting ? "Baixando..." : "Baixar Completo"}
            </Button>
            <select
              className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm focus:border-slate-300 focus:outline-none"
              value={nicheCountFilter}
              onChange={(event) =>
                setNicheCountFilter(
                  event.target.value as
                    | "all"
                    | "zero"
                    | "lt5"
                    | "btw5_10"
                    | "btw10_15"
                    | "gt15"
                    | "az"
                    | "za"
                )
              }
            >
              <option value="all">Total</option>
              <option value="az">De A a Z</option>
              <option value="za">De Z a A</option>
              <option value="gt15">Acima de 15</option>
              <option value="btw10_15">Entre 10 e 15</option>
              <option value="btw5_10">Entre 5 e 10</option>
              <option value="lt5">Abaixo de 5</option>
              <option value="zero">Zerados</option>
            </select>
            <Input
              value={nicheSearch}
              onChange={(event) => setNicheSearch(event.target.value)}
              placeholder="Buscar nicho..."
              className="w-56"
            />
          </div>
        </div>

        {nichesQuery.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="h-24 rounded-2xl border border-slate-200 bg-slate-50 animate-pulse" />
            ))}
          </div>
        ) : nichesQuery.isError ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-6 text-sm text-rose-700">
            Nao foi possivel carregar os nichos.
            <Button
              variant="outline"
              size="sm"
              className="ml-3"
              onClick={() => nichesQuery.refetch()}
            >
              Tentar novamente
            </Button>
          </div>
        ) : (
          <SerpapiNicheGrid
            items={filteredNiches}
            query={nicheSearch}
            onSelect={handleSelectNiche}
          />
        )}
      </section>

      <SerpapiNicheCompaniesModal
        open={isNicheModalOpen}
        nicheId={selectedNicheId}
        currentIndex={currentNichePosition}
        totalNiches={totalNiches}
        onClose={handleCloseNicheModal}
        onPrev={handlePrevNiche}
        onNext={handleNextNiche}
      />
    </div>
  );
};
