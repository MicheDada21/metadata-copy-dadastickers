// Thin client for the capped Dadastickers API, used when data/enunciati.csv is not on this machine.
// Anonymous: an install token is generated on first run and kept in ~/.config/dadastickers/token.
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

export const API_URL = "https://www.cryptohelvetia.com/api/ch-labs/dadastickers";
const TOKEN_PATH = join(homedir(), ".config", "dadastickers", "token");

function installToken(): string {
  if (existsSync(TOKEN_PATH)) {
    const t = readFileSync(TOKEN_PATH, "utf8").trim();
    if (/^[A-Za-z0-9_-]{16,128}$/.test(t)) return t;
  }
  const token = randomBytes(24).toString("base64url");
  mkdirSync(dirname(TOKEN_PATH), { recursive: true });
  writeFileSync(TOKEN_PATH, `${token}\n`);
  chmodSync(TOKEN_PATH, 0o600);
  return token;
}

export async function callApi<T = any>(action: string, input: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, token: installToken(), input }),
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(body.error ?? `Dadastickers service answered ${res.status}`);
  return body as T;
}
