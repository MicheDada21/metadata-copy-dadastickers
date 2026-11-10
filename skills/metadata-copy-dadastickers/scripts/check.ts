// Validate a metadata plan and print the composed values.
//   bun check.ts <plan.json> [--detect <detect.json>] [--write]
// --detect  refuses fields the page already customized and lists eligible fields the plan leaves out.
// --write   stores each composed value in the plan as "value", ready to copy into code.
import { callApi } from "./remote";
import { FIELDS, LIMITS, SEPARATOR, arg, compose, has, len, loadStatements, styleIssues, type Field, type FieldDraft } from "./lib";

type Page = { path: string; section?: string; fields: Partial<Record<Field, FieldDraft>> };
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
const norm = (s: string) => s.trim().replace(/\s+/g, " ");
// Without the local corpus, ask the service yes or no for each distinct statement in the plan.
const verified = new Map<string, boolean>();
if (!local) {
  for (const page of plan.pages) for (const d of Object.values(page.fields) as FieldDraft[]) {
    const t = norm(d?.statement ?? "");
    if (t && !verified.has(t)) verified.set(t, (await callApi<{ exists: boolean }>("verify", { text: t })).exists);
  }
}
const inCorpus = (t: string) => (local ? corpus.has(t) : verified.get(t) === true);

const home: Partial<Record<string, string>> = { ...plan.home };
if (detected) for (const [f, v] of Object.entries(detected.home.fields)) home[f] ??= v.value;

const errors: string[] = [];
const warnings: string[] = [];
const byValue = new Map<string, string>();
const statementPages = new Map<string, Set<string>>();

const sectionOf = (page: Page) => page.section ?? `/${page.path.split("/").filter(Boolean)[0] ?? ""}`;

for (const page of plan.pages) {
  console.log(`\n${page.path}`);
  const where = (field: string) => `${page.path} ${field}`;
  const seen = detected?.pages.find((p) => p.path === page.path);
  if (detected && !seen) warnings.push(`${page.path}: not in the detect report, so its current metadata is unverified`);

  for (const [field, draft] of Object.entries(page.fields) as [Field, FieldDraft][]) {
    if (!FIELDS.includes(field)) { errors.push(`${where(field)}: unknown field`); continue; }
    const limit = LIMITS[field];
    const statement = norm(draft.statement ?? "");
    const value = compose(field, { ...draft, statement }, separator);
    draft.value = value;
    const size = len(value);
    const slack = limit - size;

    if (seen && seen.fields[field]?.status === "own") errors.push(`${where(field)}: the page already has its own value; leave it as it is`);
    if (!statement) errors.push(`${where(field)}: statement missing`);
    else if (!inCorpus(statement)) errors.push(`${where(field)}: statement not found verbatim in the corpus (check with statements.ts find)`);
    if (!draft.facts?.trim()) errors.push(`${where(field)}: facts missing; the field must open with plain page facts`);
    if (slack < 0) errors.push(`${where(field)}: ${size} characters, ${-slack} over the ${limit} limit`);
    else if (slack > Math.max(5, Math.round(limit * 0.1))) warnings.push(`${where(field)}: ${slack} characters left; a longer statement or fuller facts would fit closer`);
    if (home[field] && norm(home[field]!) === norm(value)) errors.push(`${where(field)}: identical to the home page`);
    const owner = byValue.get(`${field}\n${value}`);
    if (owner) errors.push(`${where(field)}: same value as ${owner}`);
    else byValue.set(`${field}\n${value}`, page.path);
    for (const issue of styleIssues(draft.facts ?? "")) warnings.push(`${where(field)}: facts contain ${issue}`);
    if (statement) statementPages.set(statement, (statementPages.get(statement) ?? new Set()).add(page.path));

    console.log(`  ${field.padEnd(20)}${String(size).padStart(4)}/${limit}  ${value}`);
  }

  const character = plan.sections?.[sectionOf(page)]?.character;
  if (character) {
    const re = new RegExp(`(^|[^a-zà-ÿ])${character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-zà-ÿ]|$)`, "i");
    if (!Object.values(page.fields).some((d) => d && re.test(d.statement ?? ""))) {
      warnings.push(`${page.path}: no statement features the section character «${character}»`);
    }
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
