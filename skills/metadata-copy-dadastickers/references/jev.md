# Optional Jev discovery across the CSV

The calling LLM interprets the copy task and writes Jev's creative brief. Jev rapidly scores potential associations across every statement in the local CSV. The LLM then reads the findings in the actual copy, checks meaning, rhythm, surprise, tone and chain continuity, and makes the final editorial choice. Jev does not write text or select the finished copy.

This is a semantic scan using a decision model, not an embeddings index or vector database. Creative recall and usefulness have not been benchmarked. Small contexts reduce exposure to context degradation; they do not establish creative quality or calibrated scores.

## 1. The LLM writes the brief

Read the actual page or copy task, then write `<scratchpad>/jev-brief.json` yourself. Do not ask the user to prompt Jev. Include the use of the copy, the effect it should have, its readers and tone, and 2–8 concrete creative directions. Develop associations beyond literal vocabulary: imagery, metonymy, irony, tension or contrast that could serve this particular task. Name relevant exclusions without outlawing absurdity or treating poetic statements as factual product claims. Keep the JSON within 4 KB; do not send a whole page or conversation.

For example, a brief for a small sailing school's signup copy could be:

```json
{
  "task": "Find enunciati for the sailing school's signup copy",
  "purpose": "Make a first lesson feel approachable while inviting curiosity and a little adventure",
  "audience": "Adults curious about sailing who have no experience",
  "tone": "Playful, welcoming and slightly irreverent; no luxury positioning",
  "directions": [
    "Literal images of wind, sea, boats, learning and setting off",
    "Freedom, horizons and leaving the shore as metaphors for trying something unfamiliar",
    "Gentle irony about certainty, control or knowing where one is going"
  ],
  "avoid": ["Danger as a selling point", "Claims about guaranteed skill or safety"]
}
```

When nearby fields share the same intent, scan once and reuse the findings. When the task, audience, tone or creative direction changes, write a new brief and use a different output file. For a chain extension, put the current chain and intended next turn in the brief; an old generic scan is only a source of possibilities, not a judgment of the join.

## 2. Dry-run, then scan when spending is authorized

```bash
bun $S/jev-scan.ts --brief <scratchpad>/jev-brief.json --out <scratchpad>/jev-findings.json --dry-run
bun $S/jev-scan.ts --brief <scratchpad>/jev-brief.json --out <scratchpad>/jev-findings.json
```

The dry run makes no API call and reports the corpus count, remaining request count, largest request in bytes and `estimatedCostUsd`. Quote that estimate when asking for spending authorization. Each statement gets its own independent Score question. Defaults are 8 statements per request and 4 requests in flight. `--batch-size` accepts 1–16 and `--concurrency` 1–8; each complete request must fit within 12 KB. The scanner never filters by keywords, rarity, character, length or the ordinary `pick --limit`, so associative candidates can surface anywhere in the CSV. Scores are continuous from 0 (no detected connection) through tenuous and usable to 3 (a distinctive connection). In practice almost nothing scores 0: a measured scan had a median of 1.2, 1.8 at the 90th percentile and 2.63 at most, so a finding means a score at or above a threshold, 1.5 by default.

The script reads an existing `OPENROUTER_API_KEY` at runtime and uses `typesafe/jev-1.14` through OpenRouter's Decisions API. Follow the host's credential policy and spending authorization; never copy another project's key or put a key in the brief or findings. No TypeSafe account or additional package is needed. Many short paid calls replace one large-context call: the dry run's request count matters. A measured full scan on 2026-11-18 (13,935 statements, batch size 8) took 1,742 requests, 13.6 MB and $0.15, in under 25 minutes. That is cheap next to reading the whole 633 KB CSV with the calling model, but it is an extra cost over the ordinary keyword search, which costs nothing. Accuracy and creative recall remain unmeasured. `cost` sums returned `usage.cost`; `costIncomplete` flags missing billing data or failed requests and the sum then is only a known subtotal.

All CSV statements are sent to OpenRouter over the course of a scan, in small batches with the same brief. The complete corpus is never placed in one request. Keep briefs and findings in the task's scratchpad, never inside the skill folder: findings quote statements verbatim and briefs can contain private project context. The CSV remains excluded from distributed skill packages.

## 3. Reuse, inspect and choose with the LLM

```bash
bun $S/statements.ts pick --field description --facts "<page facts>" --keywords "<Italian keywords>" --jev-findings <scratchpad>/jev-findings.json --jev-brief <scratchpad>/jev-brief.json [--jev-min 1.5] --limit 30 --json
```

`pick` validates the scan against the current corpus and supplied brief and applies the normal length, character, rarity, ending and exclusion constraints. It then returns one merged list: up to `--limit` findings at or above `--jev-min`, ranked by Jev score with fit as a tie-breaker and no keyword overlap required, followed by up to half as many keyword candidates that Jev did not already return. Every candidate shows its Jev score, and in `--json` its `source` (`jev` or `keywords`), so one call covers both paths. The full saved score array is available to `pick`, so a useful short statement is not lost because a longer one ranked higher in the scan's top-60 preview. Raise `--jev-min` when the findings are too broad, lower it when a short field leaves none, or increase `--limit`. Reading findings and running `pick` make no Jev calls.

The LLM chooses among these possibilities by reading the completed field or chain, rather than accepting the highest score automatically. Reject weak or awkward connections even when Jev scores them highly. Check diverse candidates; a low score may still hide a useful creative association. When findings are poor, broaden the brief or lean on the keyword candidates. Keep verbatim verification, the plan checker and workflow step 6's user approval.

## Resume and fallback

Completed batches are saved atomically to `--out`. Rerunning the same scan explicitly resumes pending batches without charging again for completed ones. A matching corpus hash, brief hash, model and batch size are required. A lock prevents simultaneous scans of the same output. After a crash, remove a stale `.lock` only after confirming that its recorded process has stopped. As with any remote API, a timed-out or interrupted request may have been charged without returning a usable result.

HTTP 429, 502 and 503 return no generation and no charge, so a batch retries them up to three times, waiting as `Retry-After` asks or 2, 4 and 8 seconds. `requests` counts batches sent, not these retries. On any other API error, refusal, malformed score or timeout, which may already have been charged, the scanner stops launching new batches, lets already-running calls finish and saves partial coverage without retrying. Read `evaluated`, `pending`, `failures` and `costIncomplete`; only `status: "complete"` means every statement received a valid score. `pick` falls back to ordinary search until the scan is complete. The saved partial preview can be inspected for progress, but do not describe it as a scan of the whole collection.

No key or no local CSV means `jev-scan.ts` reports a fallback without a paid request. `pick` works as before without Jev flags. Missing, stale or invalid findings, or no findings that fit the field, fall back to the ordinary search and LLM choice. The old `pick --jev` flag alone now explains the scan workflow and falls back; it no longer makes a shortlist-selection call. Without the local corpus, use the anonymous CH Labs service under its existing 3-candidate/101-statement limits; full-corpus Jev scanning is unavailable and does not bypass those limits.

API details: [Jev on OpenRouter](https://openrouter.ai/docs/guides/community/jev), [Score](https://docs.typesafe.ai/primitives/score) and [Decisions API](https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-request).
