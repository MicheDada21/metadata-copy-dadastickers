---
name: metadata-copy-dadastickers
description: "Gives each subpage its own title, description and share preview, pairing page facts with verbatim Dadastickers statements, chained Catena Dada21 style where the full corpus is local. Use when subpages copy the home metadata or lack it, or a page needs Dadastickers copy."
disable-model-invocation: true
---

# Metadata copy Dadastickers

This skill gives subpages metadata of their own. Each field opens with plain **facts** about the page, which Google and AI answer engines can quote, and closes with one **statement** from the Dadastickers collection. The statement is the hook that makes a shared link worth opening. Where the full corpus is local, longer fields and on-page copy can close with a **chain** of statements joined Catena Dada21 style (rule 8).

## Setup

`$S` is the `scripts/` folder next to this file; the scripts need Bun. When this file arrived without its folder (read from a URL, or installed as a lone `SKILL.md`), install the full skill into the agent's skills folder and use that copy, for example:

```bash
D=~/.claude/skills/metadata-copy-dadastickers && mkdir -p $D && curl -fsSL https://www.cryptohelvetia.com/ch-labs/prompt-library/skills/metadata-copy-dadastickers/bundle.tar.gz | tar -xz -C $D
```

The collection is not distributed. Where `data/enunciati.csv` exists (the owner's machine) every script runs locally with no limits. Everywhere else the scripts call the CH Labs service, anonymously and with no signup: each search returns at most 3 candidates, a visitor can see 101 distinct statements in all, and after that searches draw only from those already seen, which stay reusable. Say this to the user when a search returns fewer candidates than expected. Chains (rule 8) run only with the local corpus; through the service each field takes one statement and the scripts refuse chains. The install token lives in `~/.config/dadastickers/token`. Setup is done when `bun $S/statements.ts stats` prints the statement count.

## Workflow

1. **Detect.** Point the detector at the deployed site or a local production build (`bun run build && bun run start`):
   `bun $S/detect.ts <home-url> --out <scratchpad>/detect.json`
   It reads pages from the sitemap, or crawls links when there is none, with a share-crawler user agent, so it sees the `<head>` that Facebook, LinkedIn and X see. Each field is marked `H` (copy of the home), `m` (missing), `ok` (own) or `-` (alt text on a page without an image). A field is **eligible** when it is `H` or `m`; only eligible fields change, and the home page keeps its metadata. Add `--strict` when the user wants a page changed only if none of its fields is its own. Report own values over a cap and leave them as they are. If no page is eligible, report that and stop.
2. **Cast.** Group eligible pages by section (the first path segment), run `bun $S/statements.ts characters` and give a resident character to each section whose subject connects to one (rule 4). Record the cast under `sections` in the plan. Done when every section with an eligible page has a character or a reason it has none.
3. **Facts.** Write the facts for every eligible field from the page's H1 and intro in `detect.json` and the route's source, in the page's language. For `og:title` the facts are the page name; for image alt text they describe what the image shows. Italian facts follow Blocco 1 of [umanizza-stile-linguistico](https://www.cryptohelvetia.com/ch-labs/prompt-library/chat-preferences/umanizza-stile-linguistico.md); `check.ts` flags its mechanical rules. Done when every eligible field in `detect.json` has facts.
4. **Statements.** For each field run:
   `bun $S/statements.ts pick --field <field> --facts "<facts>" [--suffix "<title template suffix>"] --keywords "<k1,k2,...>" [filters]`
   - `--keywords`: 6 to 15 Italian words, whatever the page's language, since the corpus is Italian. Mix literal terms (banca, conto, viaggio), metaphorical ones (oro, debito, orizzonte) and the section's world. Prefix `=` for an exact word (`=porto` keeps porta out); use spaces for a phrase.
   - Filters: `--character "i denari"`, `--ending question|exclamation|plain`, `--rarity high|low`, `--words 1-4`, `--match "<regex>"`, `--exclude-plan <plan.json>`, `--sort relevance`, `--limit 30`.
   - `pick` computes the room left from the cap, facts, separator and suffix, and ranks by keyword hits, then by closest fit. Read the top candidates and choose by meaning. Through the service `--limit` has no effect, and `--match` stays within the same 3-candidate and 101-statement rules.

   - Chains (rule 8, local corpus only): pick the first statement as above, then each next link with `--chain "<chain so far>" --connector "<next connector>"`, which subtracts the chain and the join from the room left. For page copy, pass `--budget <max>` instead of `--field`.

   Done when every field with facts has a statement or chain chosen under rules 3 to 8, and every page-copy slot the task asks for has its chain.
5. **Check.** Write the plan to `<project>/docs/metadata-copy-dadastickers.json` (format below) and run:
   `bun $S/check.ts <plan.json> --detect <detect.json> --write`
   Repeat until it reports 0 errors. Close a "characters left" warning whenever a better statement or fuller facts can fill the gap. `--write` stores each composed `value`.
6. **Approve.** Show one table per page (field, length/cap, composed value) and ask in a question widget, with "Approve all (Recommended)" and "Change some pages". This approval is the user's sign-off on the SEO copy, so code changes wait for it.
7. **Apply.** For Next.js, follow `references/nextjs.md`. For static HTML, edit the `<head>` tags. For other frameworks, use their head API with the same values.
8. **Verify.** Rebuild, rerun `detect.ts` on the local build and confirm that every planned field shows `ok`, fits its cap and differs from the home's. Then run the project's checks and deliver under its `AGENTS.md`.

## Copy rules

The statements are cut-outs ("ritagli") from the Manifesto Dada21: lowercase, 1 to 14 words, with no closing full stop, so each reads as an open fragment that attaches to almost any context. `references/rulebook.md` summarizes the collection's rules; read it when a statement's form or series needs explaining.

### 1. Facts first, statement last

The opening of each field stands on its own as a quotable answer: what the page is, about whom or what, and for whom. Google and AI answer engines lift that part, and a truncated preview loses only the hook. In `og:title` and `twitter:title` the order flips, statement first and page name after, because a social card is opened out of curiosity.

### 2. Verbatim

Copy each statement character for character as `statements.ts find` returns it, with its lowercase, spelling and ending, bare of quotes: each one is a collectible sticker. The facts end without punctuation and ` · ` joins the two. When no statement fits, change the facts or the keywords. `check.ts` rejects any statement missing verbatim from the corpus, asking the service yes or no when the corpus is not local.

### 3. One role per field

| Field | Order | Statement |
|---|---|---|
| `title` | facts · statement, then the template suffix | 1 to 4 words, a signature after the page keyword |
| `description` | facts · statement | fits the room the facts leave |
| `og:title` | statement · page name | the curiosity hook |
| `og:description` | facts · statement | the longest statement on the page |
| `twitter:title`, `twitter:description` | same as og | reuse the og pair unless X calls for a sharper line |
| `og:image:alt`, `twitter:image:alt` | image description · statement | only when the page has an image |

A page can repeat a statement across its own fields, and a title and an `og:title` with different statements make it richer. A framework title suffix (for example ` | Brand`) counts toward the cap: pass it as `suffix` so the checker counts the title as it renders.

### 4. A resident character where the subject calls for one

A section gets a recurring character only when its subject connects to one, and its pages then draw on statements featuring it, so the shared links tell one story. When no character fits, pick any statement in the collection by meaning. In a chain, the character matters only for statements whose subject connects to it.

| Character | Fits |
|---|---|
| dada | home-adjacent pages, manifestos, about, art |
| mamma | family, care, home life, education |
| chi | people, team, contacts, profiles |
| le bionde | fashion, beauty, gossip, lifestyle |
| il tucano | nature, travel, animals, color |
| il tampoon | products, gadgets, the absurd |
| i denari (also i danari) | money, prices, finance, shop |
| la principessa, il principino | brands, luxury, premium tiers |
| il siniscalco | administration, legal, governance |
| il marinaio | sea, voyages, logistics |

`statements.ts characters` gives the counts and the other recurring subjects, such as la vita, il mondo, l’amore, l’arte, il tempo, il lavoro and la natura.

### 5. Statement type follows page type

| Page | Filter |
|---|---|
| Guides, FAQs, articles that answer a question | `--ending question` |
| Contact, signup, shop, calls to action | `--ending exclamation` |
| About, history, timelines | `--match "^storia de"` |
| Everything else | `--ending plain` |

### 6. Rarity follows importance

Top-level pages (depth 1) take `--rarity high` for the title and `og:title`. Deeper pages take `--rarity low`, which keeps the rare statements for the pages that matter most. The rarity score follows the rulebook and lives in `scripts/lib.ts`.

### 7. Closest fit

Among the statements that match the topic, take the one that brings the field closest to its cap. When the best statement by meaning leaves room, enrich the facts before settling for a weaker statement. Caps and their sources are in `references/limits.md`; `check.ts` enforces them and warns when more than 10% of a cap is unused.

A few statements contain profanity; they suit only sites whose tone allows it.

### 8. Catena Dada21 chains

Catena Dada21 ([dada21.com/esperimenti/catena-dada21](https://dada21.com/esperimenti/catena-dada21)) joins verbatim statements with short connectors, the only words not taken from the collection. A chain replaces the single statement where a field has room for more than one, and it writes on-page copy when the task asks for it.

- **Where.** `description`, `og:description`, `twitter:description` and image alt text, plus the page-copy slots the task names (a hero intro, a section blurb, an empty state). Titles keep one statement.
- **Order.** Facts first, then ` · `, then the chain, as in rule 1. Page copy may drop the facts when the slot is pure voice, such as a footer line.
- **Connectors.** Write them yourself: a bare comma (`,`), a lowercase bridge of 1 to 3 words (`eppure`, `proprio mentre`), or a comma followed by one (`, e intanto`). No full stops, colons or capitals, so the chain reads as one open fragment. A connector bridges and never rewrites: it must not carry the meaning the statements lack.
- **No lexical repetition.** A connector word appears at most once across all chains on a page, and a statement appears at most once in a chain. A twitter field that mirrors its og field counts once.
- **Length.** Keep adding links while the field has room (rule 7). For page copy, take the length from the task and record it as `max`.

`check.ts` enforces the connector form, the 3-word cap, the page-wide repetition rule and the verbatim statements. Whether a join makes sense is your call, and the user signs it off in step 6.

## Plan format

```json
{
  "site": "https://example.com",
  "sections": { "/blog": { "character": "il tucano" } },
  "pages": [
    {
      "path": "/blog/primo-articolo",
      "fields": {
        "title": { "facts": "Primo articolo", "statement": "dada non promette nulla", "suffix": " | Esempio" },
        "description": { "facts": "Facts about the page", "statement": "verbatim statement" },
        "og:title": { "facts": "Primo articolo", "statement": "verbatim statement" },
        "og:description": {
          "facts": "Facts about the page",
          "chain": [
            { "statement": "first verbatim statement" },
            { "connector": ", eppure", "statement": "second verbatim statement" }
          ]
        }
      },
      "copy": [
        {
          "slot": "hero intro",
          "facts": "Facts about the page",
          "max": 320,
          "chain": [
            { "statement": "first verbatim statement" },
            { "connector": "proprio mentre", "statement": "second verbatim statement" },
            { "connector": ",", "statement": "third verbatim statement" }
          ]
        }
      ]
    }
  ]
}
```

A field takes either `statement` or `chain`, never both; in a chain only the links after the first carry a `connector`. `copy` lists the on-page slots the task asks for, and `--write` stores each composed text as `value` there too.

`bun $S/statements.ts find "<text>"` checks that a statement exists verbatim (through the service it answers only exact match or no match, with no nearest statements), and `bun $S/statements.ts stats` gives an overview of the corpus.
