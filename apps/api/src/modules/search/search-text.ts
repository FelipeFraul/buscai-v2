import { sql } from "drizzle-orm";

const STOPWORDS = [
  "a",
  "o",
  "as",
  "os",
  "em",
  "na",
  "no",
  "nas",
  "nos",
  "de",
  "da",
  "do",
  "das",
  "dos",
  "para",
  "pra",
  "por",
  "perto",
  "agora",
  "saindo",
  "mim",
  "minha",
  "meu",
  "e",
];

const MIN_TOKEN_LENGTH = 2;
const ACCENTED_CHARS =
  "\u00e1\u00e0\u00e3\u00e2\u00e4" +
  "\u00e9\u00e8\u00ea\u00eb" +
  "\u00ed\u00ec\u00ee\u00ef" +
  "\u00f3\u00f2\u00f4\u00f5\u00f6" +
  "\u00fa\u00f9\u00fb\u00fc" +
  "\u00e7" +
  "\u00f1";
const ASCII_CHARS =
  "aaaaa" +
  "eeee" +
  "iiii" +
  "ooooo" +
  "uuuu" +
  "c" +
  "n";

export function normalizeForMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export function tokenizeSearch(value: string): string[] {
  const cleaned = normalizeForMatch(value).replace(/\s+/g, " ").trim();
  if (!cleaned) return [];

  return cleaned
    .split(" ")
    .filter((token) => token.length >= MIN_TOKEN_LENGTH)
    .filter((token) => !STOPWORDS.includes(token));
}

export function cleanSearchText(value: string): { tokens: string[]; cleaned: string } {
  const tokens = tokenizeSearch(value);
  return {
    tokens,
    cleaned: tokens.join(" "),
  };
}

export function normalizeColumnForSearch(column: unknown) {
  return sql`translate(lower(${column}), ${ACCENTED_CHARS}, ${ASCII_CHARS})`;
}

export function getMinimumTokenMatches(tokenCount: number): number {
  if (tokenCount <= 1) return tokenCount;
  return Math.max(2, Math.ceil(tokenCount * 0.6));
}
