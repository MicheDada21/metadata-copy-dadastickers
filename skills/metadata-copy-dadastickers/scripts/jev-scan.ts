// bun jev-scan.ts --brief <LLM-authored brief.json> --out <findings.json> [--dry-run]
import { existsSync, mkdirSync, openSync, closeSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { arg, has, loadStatements } from "./lib";
import { DEFAULT_MIN_SCORE, estimateCost, parseBrief, prepareScan, scanSummary, scanWithJev, type ScanState } from "./jev";

async function main() {
  const rows = await loadStatements();
  if (!rows) { console.log(JSON.stringify({ status: "fallback", reason: "Full-corpus scanning needs the local data/enunciati.csv. Use statements.ts pick and let the LLM choose from the capped service results." })); return; }
  const briefFile = arg("--brief");
  if (!briefFile) throw Error("The calling LLM must write --brief <brief.json>; see references/jev.md.");
  const brief = parseBrief(await Bun.file(briefFile).json());
  const batchSize = Number(arg("--batch-size") ?? 8);
  const concurrency = Number(arg("--concurrency") ?? 4);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) throw Error("Concurrency must be an integer from 1 to 8.");
  const outArg = arg("--out");
  const out = outArg ? resolve(outArg) : undefined;
  if (out === resolve(briefFile)) throw Error("Use different paths for --brief and --out.");
  if (!out && !has("--dry-run")) throw Error("Supply --out <findings.json> so completed batches can be reused.");
  const resume = out && existsSync(out) ? await Bun.file(out).json() : undefined;
  const plan = prepareScan(rows, brief, batchSize, resume);
  if (has("--dry-run")) {
    console.log(JSON.stringify({ ...scanSummary(plan.state), status: "planned", dryRun: true, model: plan.state.model, batchSize, concurrency, requestsRemaining: plan.batches.length, maxRequestBytes: plan.maxRequestBytes, estimatedCostUsd: estimateCost(plan), estimate: "From the measured rate of $0.011 per MB sent; the real charge is in cost after the scan." }, null, 2));
    return;
  }
  if (!process.env.OPENROUTER_API_KEY?.trim() && plan.batches.length) { console.log(JSON.stringify({ status: "fallback", reason: "OPENROUTER_API_KEY is not configured. Use ordinary LLM selection; no signup is required." })); return; }
  const save = (state: ScanState, final = false) => {
    const findings = final ? rows.map((r, i) => ({ statement: r.text, score: state.scores[i] })).filter((r) => r.score !== null && r.score >= DEFAULT_MIN_SCORE).sort((a, b) => b.score! - a.score!).slice(0, 60) : undefined;
    writeFileSync(`${out}.tmp`, JSON.stringify({ ...state, summary: scanSummary(state), findings }, null, 2), { mode: 0o600 });
    renameSync(`${out}.tmp`, out!);
  };
  mkdirSync(dirname(out!), { recursive: true });
  // A second process must not pay for the same batches while this scan owns the output.
  let lock: number;
  try { lock = openSync(`${out}.lock`, "wx", 0o600); }
  catch { throw Error("This scan output is locked. Use another path, or remove a stale .lock only after confirming its scan process stopped."); }
  try {
    writeFileSync(lock, String(process.pid));
    // Re-read under the lock: another scan may have finished since the initial dry-run check.
    const fresh = existsSync(out!) ? await Bun.file(out!).json() : undefined;
    const current = prepareScan(rows, brief, batchSize, fresh);
    const state = await scanWithJev(current, { concurrency, onBatch: (s) => save(s) });
    save(state, true);
    console.log(JSON.stringify({ ...scanSummary(state), out, finalChoice: "The calling LLM reviews the findings and chooses the copy." }, null, 2));
  } finally { closeSync(lock); unlinkSync(`${out}.lock`); }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "Scan failed"); process.exitCode = 1; });
