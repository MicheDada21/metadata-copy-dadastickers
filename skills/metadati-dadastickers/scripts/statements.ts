// Query the Dadastickers statements.
//   bun statements.ts pick --field og:description --facts "..." --keywords "denaro,banca,=conto" [filters]
//   bun statements.ts find "<text>"        check that a statement exists verbatim
//   bun statements.ts characters           recurring characters and how many statements carry each
//   bun statements.ts stats                corpus overview
import { FIELDS, LIMITS, SEPARATOR, arg, has, len, loadStatements, pad, tokenize, type Field, type Statement } from "./lib";

const command = Bun.argv[2];
const all = await loadStatements();

const SEED_CHARACTERS = [
  "dada", "mamma", "chi", "le bionde", "il tucano", "i denari", "il tampoon", "il principino",
  "la principessa", "il siniscalco", "il ricco", "il marinaio", "il borghese", "il poeta", "il clima",
];
const ARTICLES = new Set(["il", "lo", "la", "i", "gli", "le", "l"]);
const POSSESSIVES = /^(mio|mia|miei|mie|tuo|tua|tuoi|tue|suo|sua|suoi|sue|nostr\w|vostr\w|loro|più|propri\w|prim\w|altr\w|grande|cosa|cose)$/;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const phraseRe = (p: string) => new RegExp(`(^|[^a-zà-ÿ])${escape(p.toLowerCase())}([^a-zà-ÿ]|$)`, "i");

type Matcher = { keyword: string; test: (s: Statement) => boolean };

function matcherFor(raw: string): Matcher {
  const keyword = raw.trim().toLowerCase();
  if (keyword.startsWith("=")) {
    const word = keyword.slice(1);
    return { keyword, test: (s) => s.tokens.includes(word) };
  }
  if (keyword.includes(" ")) {
    const re = phraseRe(keyword);
    return { keyword, test: (s) => re.test(s.text) };
  }
  if (keyword.length <= 3) return { keyword, test: (s) => s.tokens.includes(keyword) };
  // Light Italian stemming. Short stems only swap the final vowels (porto → porti, not portiere);
  // longer stems also accept derived forms (equilibrio → equilibrato).
  const stem = keyword.replace(/[aeiouàèéìòóù]+$/, "");
  if (stem.length <= 4) {
    const re = new RegExp(`^${escape(stem)}[aeiouàèéìòóù]{0,2}$`);
    return { keyword, test: (s) => s.tokens.some((t) => re.test(t)) };
  }
  return { keyword, test: (s) => s.tokens.some((t) => t.startsWith(stem) && t.length <= stem.length + 5) };
}

function wordRange(spec: string | undefined): [number, number] {
  if (!spec) return [1, 99];
  const [a, b] = spec.split("-").map(Number);
  return [a || 1, b || a || 99];
}

async function usedInPlan(path: string | undefined): Promise<Set<string>> {
  const used = new Set<string>();
  if (!path) return used;
  const plan = await Bun.file(path).json();
  for (const page of plan.pages ?? []) for (const draft of Object.values(page.fields ?? {}) as { statement?: string }[]) {
    if (draft.statement) used.add(draft.statement.trim());
  }
  return used;
}

async function pick() {
  const field = arg("--field") as Field | undefined;
  if (field && !FIELDS.includes(field)) throw new Error(`Unknown field ${field}. Use one of: ${FIELDS.join(", ")}`);
  const facts = arg("--facts") ?? "";
  const suffix = arg("--suffix") ?? "";
  const separator = arg("--separator") ?? SEPARATOR;
  const limit = field ? LIMITS[field] : undefined;
  const budget = arg("--budget") ? Number(arg("--budget"))
    : limit !== undefined ? limit - len(facts.trim()) - len(suffix) - (facts.trim() ? len(separator) : 0) : 999;
  if (budget <= 0) throw new Error(`No room left: facts and suffix already use the whole ${limit}-character limit.`);

  const matchers = (arg("--keywords") ?? "").split(",").filter((k) => k.trim()).map(matcherFor);
  const character = arg("--character");
  const characterRe = character ? phraseRe(character) : undefined;
  const ending = arg("--ending") ?? "any";
  const rarity = arg("--rarity") ?? "any";
  const [minWords, maxWords] = wordRange(arg("--words"));
  const match = arg("--match") ? new RegExp(arg("--match")!, "i") : undefined;
  const used = await usedInPlan(arg("--exclude-plan"));
  const loose = has("--loose");
  const sort = arg("--sort") ?? "fit";
  const max = Number(arg("--limit") ?? 20);

  const df = new Map(matchers.map((m) => [m.keyword, all.filter(m.test).length]));
  const idf = (k: string) => Math.log(all.length / (1 + (df.get(k) ?? 0)));

  const rows = all
    .filter((s) => s.length <= budget)
    .filter((s) => s.words >= minWords && s.words <= maxWords)
    .filter((s) => ending === "any" || s.ending === ending)
    .filter((s) => rarity === "any" || (rarity === "high" ? s.rarity >= 9 : s.rarity < 9))
    .filter((s) => !characterRe || characterRe.test(s.text))
    .filter((s) => !match || match.test(s.text))
    .filter((s) => !used.has(s.text))
    .map((s) => {
      const hits = matchers.filter((m) => m.test(s)).map((m) => m.keyword);
      return { s, hits, score: hits.reduce((sum, k) => sum + idf(k), 0), slack: budget - s.length };
    })
    .filter((r) => loose || matchers.length === 0 || r.hits.length > 0)
    .sort((a, b) => sort === "relevance"
      ? b.score - a.score || a.slack - b.slack
      : b.hits.length - a.hits.length || a.slack - b.slack || b.score - a.score)
    .slice(0, max);

  if (has("--json")) {
    console.log(JSON.stringify({ field, limit, budget, candidates: rows.map((r) => ({ ...r.s, tokens: undefined, hits: r.hits, score: +r.score.toFixed(2), slack: r.slack })) }, null, 2));
    return;
  }
  console.log(`field ${field ?? "-"}  limit ${limit ?? "-"}  facts ${len(facts.trim())}  suffix ${len(suffix)}  budget for the statement ${budget}`);
  for (const k of matchers) console.log(`  keyword ${pad(k.keyword, 18)} in ${df.get(k.keyword)} statements`);
  if (!rows.length) console.log("No candidates. Add synonyms or metaphorical keywords, relax a filter, or shorten the facts.");
  console.log(`${pad("slack", 6)}${pad("len", 5)}${pad("rar", 5)}${pad("hits", 24)}statement`);
  for (const r of rows) console.log(`${pad(r.slack, 6)}${pad(r.s.length, 5)}${pad(r.s.rarity, 5)}${pad(r.hits.join(",") || "-", 24)}${r.s.text}`);
}

function find() {
  const query = (Bun.argv[3] ?? "").trim().replace(/\s+/g, " ");
  const exact = all.find((s) => s.text === query);
  if (exact) { console.log(`exact match (${exact.length} chars, rarity ${exact.rarity})\n${exact.text}`); return; }
  const lower = query.toLowerCase();
  const near = all.filter((s) => s.text.toLowerCase().includes(lower) || lower.includes(s.text.toLowerCase())).slice(0, 10);
  console.log(near.length ? `no exact match; closest:\n${near.map((s) => s.text).join("\n")}` : "no match");
  process.exitCode = 1;
}

function characters() {
  console.log("Recurring characters (statements that carry each):");
  for (const c of SEED_CHARACTERS) {
    const re = phraseRe(c);
    console.log(`  ${pad(c, 18)}${all.filter((s) => re.test(s.text)).length}`);
  }
  const counts = new Map<string, number>();
  for (const s of all) {
    const t = tokenize(s.text);
    for (let i = 0; i < t.length - 1; i++) {
      if (!ARTICLES.has(t[i]) || t[i + 1].length < 3 || POSSESSIVES.test(t[i + 1])) continue;
      const key = `${t[i] === "l" ? "l’" : `${t[i]} `}${t[i + 1]}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const min = Number(arg("--min") ?? 10);
  console.log(`\nOther recurring subjects (at least ${min} statements):`);
  console.log([...counts].filter(([, n]) => n >= min).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(", "));
}

function stats() {
  const by = <T,>(f: (s: Statement) => T) => all.reduce((m, s) => m.set(f(s), (m.get(f(s)) ?? 0) + 1), new Map<T, number>());
  console.log(`statements ${all.length}`);
  console.log(`endings ${JSON.stringify(Object.fromEntries(by((s) => s.ending)))}`);
  console.log(`with "dada" ${all.filter((s) => s.hasDada).length}`);
  console.log(`rarity ${JSON.stringify(Object.fromEntries([...by((s) => s.rarity)].sort((a, b) => a[0] - b[0])))}`);
  for (const cap of [20, 30, 40, 50, 60, 70, 100]) console.log(`  up to ${cap} chars: ${all.filter((s) => s.length <= cap).length}`);
}

const commands: Record<string, () => unknown> = { pick, find, characters, stats };
if (!command || !commands[command]) {
  console.log("Usage: bun statements.ts pick|find|characters|stats  (see the header of this file)");
  process.exit(1);
}
await commands[command]();
