// Shared helpers: statement corpus, field limits, composition and text checks.
import { dirname, join } from "node:path";

export const SKILL_DIR = join(dirname(import.meta.path), "..");
export const CSV_PATH = join(SKILL_DIR, "data", "enunciati.csv");
// Public copy of the statements, used when the skill was installed without data/.
export const CSV_URL = "https://www.cryptohelvetia.com/ch-labs/prompt-library/skills/metadati-dadastickers/files/data/enunciati.csv";
export const SEPARATOR = " · ";

// Character caps per field, verified 2026-10-26. Sources and reasoning: references/limits.md.
export const LIMITS = {
  title: 60,
  description: 155,
  "og:title": 70,
  "og:description": 200,
  "og:image:alt": 420,
  "twitter:title": 70,
  "twitter:description": 200,
  "twitter:image:alt": 420,
} as const;

export type Field = keyof typeof LIMITS;
export const FIELDS = Object.keys(LIMITS) as Field[];

// og:title opens with the statement; every other field opens with the page facts.
export const STATEMENT_FIRST: ReadonlySet<Field> = new Set(["og:title", "twitter:title"]);

export const len = (s: string) => [...s].length;

export type Statement = {
  text: string;
  length: number;
  words: number;
  ending: "question" | "exclamation" | "plain";
  hasDada: boolean;
  rarity: number;
  tokens: string[];
};

// Rarity follows the Dadastickers rulebook: floor 5 credits, +4 with "dada", +2 three words, +3 two words, +5 one word.
export function rarityOf(text: string, words: number): number {
  let score = 5;
  if (/(^|[^a-zà-ù])dada([^a-zà-ù]|$)/i.test(text)) score += 4;
  if (words === 3) score += 2;
  if (words === 2) score += 3;
  if (words === 1) score += 5;
  return score;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’'`]/g, " ")
    .split(/[^a-zà-öø-ÿ]+/i)
    .filter(Boolean);
}

function parseCsv(raw: string): string[] {
  const out: string[] = [];
  let i = 0;
  const n = raw.length;
  while (i < n) {
    let cell = "";
    if (raw[i] === '"') {
      i++;
      while (i < n) {
        if (raw[i] === '"' && raw[i + 1] === '"') { cell += '"'; i += 2; continue; }
        if (raw[i] === '"') { i++; break; }
        cell += raw[i++];
      }
      while (i < n && raw[i] !== "\n") i++; // single-column file: ignore anything after the closing quote
    } else {
      while (i < n && raw[i] !== "\n") cell += raw[i++];
    }
    i++;
    out.push(cell.replace(/\r$/, ""));
  }
  return out;
}

let cache: Statement[] | undefined;

export async function loadStatements(): Promise<Statement[]> {
  if (cache) return cache;
  if (!(await Bun.file(CSV_PATH).exists())) {
    const res = await fetch(CSV_URL);
    if (!res.ok) throw new Error(`Statements file missing at ${CSV_PATH} and download failed (${res.status} ${CSV_URL})`);
    await Bun.write(CSV_PATH, await res.text());
    console.error(`downloaded the statements to ${CSV_PATH}`);
  }
  const raw = (await Bun.file(CSV_PATH).text()).replace(/^﻿/, "");
  const seen = new Set<string>();
  cache = [];
  for (const cell of parseCsv(raw)) {
    const text = cell.trim().replace(/\s+/g, " ");
    if (!text || seen.has(text)) continue;
    seen.add(text);
    const words = text.split(" ").length;
    cache.push({
      text,
      length: len(text),
      words,
      ending: text.endsWith("?") ? "question" : text.endsWith("!") ? "exclamation" : "plain",
      hasDada: /(^|[^a-zà-ù])dada([^a-zà-ù]|$)/i.test(text),
      rarity: rarityOf(text, words),
      tokens: tokenize(text),
    });
  }
  return cache;
}

export type FieldDraft = { facts: string; statement: string; suffix?: string; value?: string };

export function compose(field: Field, draft: FieldDraft, separator = SEPARATOR): string {
  const facts = draft.facts.trim();
  const statement = draft.statement.trim();
  const body = !facts ? statement : !statement ? facts
    : STATEMENT_FIRST.has(field) ? `${statement}${separator}${facts}` : `${facts}${separator}${statement}`;
  return body + (draft.suffix ?? "");
}

// Mechanical subset of filtra-stile-linguistico Blocco 1, applied to the facts only (statements stay verbatim).
const STYLE_RULES: [RegExp, string][] = [
  [/—/, "em dash"],
  [/:/, "colon"],
  [/;/, "semicolon"],
  [/\bdavvero\b/i, "'davvero' as intensifier"],
  [/\bcrucial/i, "'crucial'"],
  [/\b(fondamentale|chiave)\b/i, "'fondamentale' or 'chiave' used as filler"],
  [/\b(sottoline|evidenzi)/i, "'sottolineare' or 'evidenziare'"],
  [/\btradizional/i, "'tradizionale' (allowed only before the 1900s)"],
  [/\b(rito|rituale)\b/i, "'rito' or 'rituale' outside a sacred context"],
  [/\bsimbolic/i, "'simbolico' as emphasis"],
  [/\bnon\b[^.·]{1,40}\s(ma|bensì)(?=[\s,]|$)/i, "contrastive negation (non X ma Y)"],
  [/[“”"]/, "straight or curly quotes (prefer « »)"],
];

export function styleIssues(text: string): string[] {
  return STYLE_RULES.filter(([re]) => re.test(text)).map(([, label]) => label);
}

export function arg(flag: string, argv = Bun.argv): string | undefined {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}

export function has(flag: string, argv = Bun.argv): boolean {
  return argv.includes(flag);
}

export function pad(s: string | number, width: number): string {
  const str = String(s);
  return str + " ".repeat(Math.max(0, width - len(str)));
}
