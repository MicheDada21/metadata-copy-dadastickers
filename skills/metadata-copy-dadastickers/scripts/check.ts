// Validate a metadata plan and print the composed values.
//   bun check.ts <plan.json> [--detect <detect.json>] [--write]
// --detect  refuses fields the page already customized and lists eligible fields the plan leaves out.
// --write   stores each composed value in the plan as "value", ready to copy into code.
import { callApi } from "./remote";
import {
  FIELDS, LIMITS, SEPARATOR, SINGLE_STATEMENT, arg, chainText, compose, composeCopy, connectorIssue, connectorWords, has, len,
  loadStatements, statementsOf, styleIssues, type ChainLink, type CopyDraft, type Field, type FieldDraft,
} from "./lib";

type Page = { path: string; section?: string; fields: Partial<Record<Field, FieldDraft>>; copy?: CopyDraft[] };
type Plan = { site?: string; separator?: string; sections?: Record<string, { character?: string }>; home?: Partial<Record<Field, string>>; pages: Page[] };
type Detected = { home: { fields: Record<string, { value: string }> }; pages: { path: string; fields: Record<string, { status: string }>; eligible: string[] }[] };

const planPath = Bun.argv[2];
if (!planPath || planPath.startsWith("--")) {
  console.log("Usage: bun check.ts <plan.json> [--detect <detect.json>] [--write]");
  process.exit(1);
}
const plan: Plan = await Bun.file(planPath).json();
const detectPath = arg("--detect");
const detected: Detected | undefined = detectPath ? await Bun.file(detectPath).json() : undefined;
const separator = plan.separator ?? SEPARATOR;
const local = await loadStatements();
const corpus = new Set((local ?? []).map((s) => s.text));
const norm = (s: string) => s.normalize("NFC").trim().replace(/\s+/g, " ");

const errors: string[] = [];
const warnings: string[] = [];

// Catena Dada21 runs only where the full corpus is local; the capped service is too thin for chains.
const usesChains = plan.pages.some((p) => (p.copy?.length ?? 0) > 0 || Object.values(p.fields).some((d) => d?.chain?.length));
if (usesChains && !local) {
  errors.push("the plan uses Catena Dada21 chains, which need the local corpus (data/enunciati.csv); use one statement per field instead");
}

// Without the local corpus, ask the service yes or no for each distinct statement in the plan.
const verified = new Map<string, boolean>();
if (!local) {
  for (const page of plan.pages) for (const d of Object.values(page.fields) as FieldDraft[]) {
    for (const t of statementsOf(d ?? {})) if (!verified.has(t)) verified.set(t, (await callApi<{ exists: boolean }>("verify", { text: t })).exists);
  }
}
const inCorpus = (t: string) => (local ? corpus.has(t) : verified.get(t) === true);

const home: Partial<Record<string, string>> = { ...plan.home };
if (detected) for (const [f, v] of Object.entries(detected.home.fields)) home[f] ??= v.value;

const byValue = new Map<string, string>();
const statementPages = new Map<string, Set<string>>();

const sectionOf = (page: Page) => page.section ?? `/${page.path.split("/").filter(Boolean)[0] ?? ""}`;

// Checks shared by field chains and page copy: verbatim statements, valid connectors, no statement twice.
function checkChain(where: string, chain: ChainLink[]) {
  const seen = new Set<string>();
  chain.forEach((link, i) => {
    const s = norm(link.statement ?? "");
    if (!s) errors.push(`${where}: link ${i + 1} has no statement`);
    else if (!inCorpus(s)) errors.push(`${where}: «${s}» not found verbatim in the corpus (check with statements.ts find)`);
    if (s && seen.has(s)) errors.push(`${where}: «${s}» appears twice in the chain`);
    seen.add(s);
    if (i === 0 && link.connector) errors.push(`${where}: the first link takes no connector`);
    if (i > 0) { const issue = connectorIssue(link.connector); if (issue) errors.push(`${where}: link ${i + 1} ${issue}`); }
  });
  if (chain.length === 1) warnings.push(`${where}: a chain of one statement; use "statement" instead`);
}

function checkFit(where: string, size: number, limit: number) {
  const slack = limit - size;
  if (slack < 0) errors.push(`${where}: ${size} characters, ${-slack} over the ${limit} limit`);
  else if (slack > Math.max(5, Math.round(limit * 0.1))) warnings.push(`${where}: ${slack} characters left; another statement, a longer one or fuller facts would fit closer`);
}

for (const page of plan.pages) {
  console.log(`\n${page.path}`);
  const where = (field: string) => `${page.path} ${field}`;
  const seen = detected?.pages.find((p) => p.path === page.path);
  if (detected && !seen) warnings.push(`${page.path}: not in the detect report, so its current metadata is unverified`);
  // Connector words used on this page, counted once per distinct chain (the twitter pair may mirror the og pair).
  const chainsOnPage = new Map<string, string>();

  for (const [field, draft] of Object.entries(page.fields) as [Field, FieldDraft][]) {
    if (!FIELDS.includes(field)) { errors.push(`${where(field)}: unknown field`); continue; }
    const limit = LIMITS[field];
    if (draft.statement) draft.statement = norm(draft.statement);
    const value = compose(field, draft, separator);
    draft.value = value;
    const size = len(value);

    if (seen && seen.fields[field]?.status === "own") errors.push(`${where(field)}: the page already has its own value; leave it as it is`);
    if (draft.chain?.length) {
      if (draft.statement) errors.push(`${where(field)}: set either "statement" or "chain", not both`);
      if (SINGLE_STATEMENT.has(field)) errors.push(`${where(field)}: titles keep a single statement; move the chain to a description`);
      checkChain(where(field), draft.chain);
      chainsOnPage.set(chainText(draft.chain), where(field));
    } else if (!draft.statement) errors.push(`${where(field)}: statement missing`);
    else if (!inCorpus(draft.statement)) errors.push(`${where(field)}: statement not found verbatim in the corpus (check with statements.ts find)`);
    if (!draft.facts?.trim()) errors.push(`${where(field)}: facts missing; the field must open with plain page facts`);
    checkFit(where(field), size, limit);
    if (home[field] && norm(home[field]!) === norm(value)) errors.push(`${where(field)}: identical to the home page`);
    const owner = byValue.get(`${field}\n${value}`);
    if (owner) errors.push(`${where(field)}: same value as ${owner}`);
    else byValue.set(`${field}\n${value}`, page.path);
    for (const issue of styleIssues(draft.facts ?? "")) warnings.push(`${where(field)}: facts contain ${issue}`);
    for (const s of statementsOf(draft)) statementPages.set(s, (statementPages.get(s) ?? new Set()).add(page.path));

    console.log(`  ${field.padEnd(20)}${String(size).padStart(4)}/${limit}  ${value}`);
  }

  for (const [i, copy] of (page.copy ?? []).entries()) {
    const label = where(`copy «${copy.slot || i + 1}»`);
    if (!copy.chain?.length) { errors.push(`${label}: chain missing`); continue; }
    checkChain(label, copy.chain);
    chainsOnPage.set(chainText(copy.chain), label);
    copy.value = composeCopy(copy, separator);
    const size = len(copy.value);
    if (copy.max) checkFit(label, size, copy.max);
    if (!copy.facts?.trim()) warnings.push(`${label}: no facts; page copy usually opens with what the page is`);
    for (const issue of styleIssues(copy.facts ?? "")) warnings.push(`${label}: facts contain ${issue}`);
    for (const l of copy.chain) statementPages.set(norm(l.statement), (statementPages.get(norm(l.statement)) ?? new Set()).add(page.path));
    console.log(`  ${`copy ${copy.slot}`.padEnd(20)}${String(size).padStart(4)}/${copy.max ?? "-"}  ${copy.value}`);
  }

  // Lexical redundancy: a connector word appears at most once across the page's chains.
  const wordUse = new Map<string, string[]>();
  const all = [
    ...Object.values(page.fields).filter((d) => d?.chain?.length).map((d) => d!.chain!),
    ...(page.copy ?? []).filter((c) => c.chain?.length).map((c) => c.chain),
  ];
  const counted = new Set<string>();
  for (const chain of all) {
    const text = chainText(chain);
    if (counted.has(text)) continue;
    counted.add(text);
    for (const link of chain.slice(1)) for (const w of connectorWords(link.connector ?? "")) {
      wordUse.set(w, [...(wordUse.get(w) ?? []), chainsOnPage.get(text) ?? page.path]);
    }
  }
  for (const [w, places] of wordUse) if (places.length > 1) errors.push(`${page.path}: connector word «${w}» used ${places.length} times on the page (${places.join(", ")}); vary it`);

  const character = plan.sections?.[sectionOf(page)]?.character;
  if (character) {
    const re = new RegExp(`(^|[^a-zà-ÿ])${character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-zà-ÿ]|$)`, "i");
    const texts = [...Object.values(page.fields).flatMap((d) => statementsOf(d ?? {})), ...(page.copy ?? []).flatMap((c) => c.chain.map((l) => l.statement))];
    if (!texts.some((t) => re.test(t))) warnings.push(`${page.path}: no statement features the section character «${character}»`);
  }
  if (seen) {
    const missing = seen.eligible.filter((f) => !(f in page.fields));
    if (missing.length) warnings.push(`${page.path}: eligible fields left out of the plan: ${missing.join(", ")}`);
  }
}

for (const [statement, pages] of statementPages) {
  if (pages.size > 1) warnings.push(`statement «${statement}» appears on ${pages.size} pages: ${[...pages].join(", ")}`);
}
if (detected) {
  const planned = new Set(plan.pages.map((p) => p.path));
  for (const p of detected.pages) if (p.eligible.length && !planned.has(p.path)) warnings.push(`${p.path}: eligible in the detect report but missing from the plan`);
}

if (has("--write")) await Bun.write(planPath, `${JSON.stringify(plan, null, 2)}\n`);

console.log(`\n${errors.length} errors, ${warnings.length} warnings`);
for (const e of errors) console.log(`ERROR ${e}`);
for (const w of warnings) console.log(`warn  ${w}`);
process.exit(errors.length ? 1 : 0);
