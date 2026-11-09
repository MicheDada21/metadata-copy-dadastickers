// Find subpages whose metadata is still the home page default.
//   bun detect.ts <home-url> [--paths /a,/b] [--sitemap <url>] [--max 200] [--strict] [--ua <agent>] [--out detect.json]
// Pages come from --paths, else the sitemap (robots.txt, then /sitemap.xml), else a crawl of internal links.
// Each field gets a status: own (page-specific), home-copy (same as home), missing, or n/a (alt text without an image).
// A field is eligible when it is home-copy or missing. --strict makes a page eligible only when none of its fields is own.
import { FIELDS, LIMITS, arg, has, len, pad, type Field } from "./lib";

const base = Bun.argv[2];
if (!base || base.startsWith("--")) {
  console.log("Usage: bun detect.ts <home-url> [--paths /a,/b] [--sitemap <url>] [--max 200] [--strict] [--out detect.json]");
  process.exit(1);
}
const home = new URL(base);
// Share crawlers such as facebookexternalhit get metadata in <head>; Next.js may stream it into <body> for browsers.
const UA = arg("--ua") ?? "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";
const MAX = Number(arg("--max") ?? 200);
const STRICT = has("--strict");

type Snapshot = {
  url: string; path: string; status: number; lang: string; canonical: string; image: string;
  h1: string; intro: string; fields: Record<Field, string>; links: string[];
};

const decode = (s: string) => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
const clean = (s: string) => decode(s).replace(/\s+/g, " ").trim();

async function get(url: string) {
  return fetch(url, { headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,*/*" }, redirect: "follow", signal: AbortSignal.timeout(20_000) });
}

async function snapshot(url: string): Promise<Snapshot | undefined> {
  let res: Response;
  try { res = await get(url); } catch (e) { console.error(`skip ${url}: ${(e as Error).message}`); return; }
  if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return;
  const fields = Object.fromEntries(FIELDS.map((f) => [f, ""])) as Record<Field, string>;
  const snap: Snapshot = { url: res.url, path: new URL(res.url).pathname, status: res.status, lang: "", canonical: "", image: "", h1: "", intro: "", fields, links: [] };
  let headTitle = "", anyTitle = "", inHeadTitle = false, inAnyTitle = false, inSvg = 0, h1 = "", h1Done = false, p = "";
  const metaKeys: Record<string, Field | "image"> = {
    description: "description", "og:title": "og:title", "og:description": "og:description", "og:image:alt": "og:image:alt",
    "twitter:title": "twitter:title", "twitter:description": "twitter:description", "twitter:image:alt": "twitter:image:alt",
    "og:image": "image", "og:image:url": "image", "twitter:image": "image",
  };
  await new HTMLRewriter()
    .on("html", { element(e) { snap.lang = e.getAttribute("lang") ?? ""; } })
    .on("svg", { element(e) { inSvg++; e.onEndTag(() => { inSvg--; }); } })
    .on("head title", { element(e) { inHeadTitle = true; e.onEndTag(() => { inHeadTitle = false; }); }, text(t) { if (inHeadTitle) headTitle += t.text; } })
    .on("title", { element(e) { if (inSvg || anyTitle) return; inAnyTitle = true; e.onEndTag(() => { inAnyTitle = false; }); }, text(t) { if (inAnyTitle) anyTitle += t.text; } })
    .on("meta", {
      element(e) {
        const key = (e.getAttribute("property") ?? e.getAttribute("name") ?? "").toLowerCase();
        const target = metaKeys[key];
        const content = clean(e.getAttribute("content") ?? "");
        if (!target || !content) return;
        if (target === "image") { snap.image ||= content; return; }
        if (!snap.fields[target]) snap.fields[target] = content;
      },
    })
    .on('link[rel="canonical"]', { element(e) { snap.canonical ||= e.getAttribute("href") ?? ""; } })
    .on("h1", { element(e) { if (h1Done) return; e.onEndTag(() => { h1Done = true; }); }, text(t) { if (!h1Done) h1 += t.text; } })
    .on("p", {
      element(e) { p = ""; e.onEndTag(() => { const text = clean(p); if (!snap.intro && len(text) >= 60) snap.intro = text.slice(0, 400); }); },
      text(t) { p += t.text; },
    })
    .on("a[href]", { element(e) { snap.links.push(e.getAttribute("href") ?? ""); } })
    .transform(res)
    .text();
  snap.fields.title = clean(headTitle || anyTitle);
  snap.h1 = clean(h1);
  return snap;
}

async function sitemapPaths(): Promise<string[]> {
  const queue: string[] = [];
  const explicit = arg("--sitemap");
  if (explicit) queue.push(explicit);
  else {
    try {
      const robots = await (await get(new URL("/robots.txt", home).href)).text();
      for (const m of robots.matchAll(/^\s*sitemap:\s*(\S+)/gim)) queue.push(m[1]);
    } catch {}
    if (!queue.length) queue.push(new URL("/sitemap.xml", home).href);
  }
  const paths = new Set<string>();
  let fetched = 0;
  while (queue.length && fetched < 25) {
    // Sitemaps may name the production host; keep the path and resolve it against the URL being tested.
    const next = queue.shift()!;
    const url = new URL(new URL(next, home).pathname + new URL(next, home).search, home).href;
    fetched++;
    let xml = "";
    try { const res = await get(url); if (res.ok) xml = await res.text(); } catch {}
    const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => decode(m[1]));
    if (/<sitemapindex/i.test(xml)) queue.push(...locs);
    else for (const loc of locs) paths.add(new URL(loc, home).pathname);
  }
  return [...paths];
}

const ASSET = /\.(png|jpe?g|gif|webp|avif|svg|ico|pdf|zip|mp4|mp3|webm|css|js|json|xml|txt|woff2?)$/i;

function internal(href: string, from: string): string | undefined {
  try {
    const u = new URL(href, from);
    if (u.origin !== home.origin || ASSET.test(u.pathname)) return;
    return u.pathname;
  } catch {}
}

async function pool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  await Promise.all(Array.from({ length: size }, async () => { while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]); } }));
  return out;
}

const homeSnap = await snapshot(home.href);
if (!homeSnap) { console.error(`Could not read the home page at ${home.href}`); process.exit(1); }
const homePath = homeSnap.path;

let paths = arg("--paths")?.split(",").map((p) => p.trim()).filter(Boolean) ?? [];
let source = "paths";
if (!paths.length) { paths = await sitemapPaths(); source = "sitemap"; }
const pages: Snapshot[] = [];
const seen = new Set<string>([homePath]);
if (paths.length) {
  const list = paths.filter((p) => p !== homePath && p !== "/").slice(0, MAX);
  for (const s of await pool(list, 6, (p) => snapshot(new URL(p, home).href))) {
    if (s && !seen.has(s.path)) { seen.add(s.path); pages.push(s); }
  }
} else {
  source = "crawl";
  const queue = [...new Set(homeSnap.links.map((h) => internal(h, homeSnap.url)).filter((p): p is string => !!p))];
  while (queue.length && pages.length < MAX) {
    const batch = queue.splice(0, 6).filter((p) => !seen.has(p));
    batch.forEach((p) => seen.add(p));
    for (const s of await pool(batch, 6, (p) => snapshot(new URL(p, home).href))) {
      if (!s || s.path === homePath || pages.some((x) => x.path === s.path)) continue;
      pages.push(s);
      for (const h of s.links) { const p = internal(h, s.url); if (p && !seen.has(p) && !queue.includes(p)) queue.push(p); }
    }
  }
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
const isAlt = (f: Field) => f.endsWith(":image:alt");

const report = pages.sort((a, b) => a.path.localeCompare(b.path)).map((s) => {
  const fields = {} as Record<Field, { value: string; status: string; length: number; limit: number }>;
  for (const f of FIELDS) {
    const value = s.fields[f];
    const status = isAlt(f) && !s.image ? "n/a"
      : !value ? "missing"
      : homeSnap.fields[f] && norm(value) === norm(homeSnap.fields[f]) ? "home-copy"
      : "own";
    fields[f] = { value, status, length: len(value), limit: LIMITS[f] };
  }
  const hasOwn = FIELDS.some((f) => fields[f].status === "own");
  const eligible = STRICT && hasOwn ? [] : FIELDS.filter((f) => fields[f].status === "home-copy" || fields[f].status === "missing");
  return { path: s.path, url: s.url, lang: s.lang, depth: s.path.split("/").filter(Boolean).length, image: s.image, h1: s.h1, intro: s.intro, fields, eligible };
});

const short: Record<Field, string> = {
  title: "T", description: "D", "og:title": "oT", "og:description": "oD", "og:image:alt": "oA",
  "twitter:title": "xT", "twitter:description": "xD", "twitter:image:alt": "xA",
};
console.log(`home ${homeSnap.url}  pages ${report.length} (from ${source})  agent ${UA.split(" ")[0]}${STRICT ? "  strict" : ""}`);
console.log(`legend: T title, D description, oT/oD/oA og title/description/image alt, xT/xD/xA twitter. Uppercase H = home copy, m = missing, ok = own`);
for (const f of FIELDS) if (homeSnap.fields[f]) console.log(`  home ${pad(f, 20)}${homeSnap.fields[f]}`);
console.log("");
for (const r of report) {
  const cells = FIELDS.map((f) => {
    const st = r.fields[f].status;
    const over = r.fields[f].length > r.fields[f].limit ? "!" : "";
    return `${short[f]}:${st === "home-copy" ? "H" : st === "missing" ? "m" : st === "own" ? "ok" : "-"}${over}`;
  });
  console.log(`${pad(r.path, 32)}${cells.map((c) => pad(c, 6)).join("")} ${r.eligible.length ? `eligible ${r.eligible.length}` : "untouched"}`);
}
const over = report.flatMap((r) => FIELDS.filter((f) => r.fields[f].length > r.fields[f].limit).map((f) => `${r.path} ${f} ${r.fields[f].length}/${r.fields[f].limit}`));
if (over.length) console.log(`\nover the limit (!):\n  ${over.join("\n  ")}`);
console.log(`\n${report.filter((r) => r.eligible.length).length} of ${report.length} pages have eligible fields`);

const out = arg("--out");
if (out) {
  const homeFields = Object.fromEntries(FIELDS.map((f) => [f, { value: homeSnap.fields[f], length: len(homeSnap.fields[f]) }]));
  await Bun.write(out, `${JSON.stringify({ base: home.href, fetchedAt: new Date().toISOString(), agent: UA, strict: STRICT, source, home: { path: homePath, image: homeSnap.image, fields: homeFields }, pages: report }, null, 2)}\n`);
  console.log(`wrote ${out}`);
}
