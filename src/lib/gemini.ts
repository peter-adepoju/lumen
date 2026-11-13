// The user's own Gemini key. Calls go from the device straight to Google; Lumen's servers never see the key.

export const AI_STUDIO_URL = "https://aistudio.google.com/apikey";
const BASE = "https://generativelanguage.googleapis.com/v1beta";
export const DEFAULT_MODEL = "gemini-flash-latest";

/**
 * A loose check that catches paste mistakes only (an empty box, a sentence, a
 * half-copied key). Google has changed its key format before ("AIza…", then
 * "AQ.…"), so no prefix or exact length is assumed: any single unbroken token
 * of 20 to 512 key-like characters passes, and Google's own check decides.
 */
export function looksLikeKey(k: string): boolean {
  return /^[A-Za-z0-9._~+/=:-]{20,512}$/.test(k.trim());
}

export type KeyCheck = { ok: true } | { ok: false; reason: "format" | "invalid" | "not_enabled" | "quota" | "network" };

export async function checkKey(key: string, fetcher: typeof fetch = fetch): Promise<KeyCheck> {
  const k = key.trim();
  if (!looksLikeKey(k)) return { ok: false, reason: "format" };
  try {
    const res = await fetcher(`${BASE}/models?pageSize=1`, { headers: { "x-goog-api-key": k } });
    if (res.ok) return { ok: true };
    const body = await res.json().catch(() => ({}));
    const msg = JSON.stringify(body);
    if (res.status === 429) return { ok: false, reason: "quota" };
    if (/SERVICE_DISABLED|has not been used|is disabled/i.test(msg)) return { ok: false, reason: "not_enabled" };
    return { ok: false, reason: "invalid" };
  } catch {
    return { ok: false, reason: "network" };
  }
}

export const KEY_PROBLEM: Record<Exclude<KeyCheck, { ok: true }>["reason"], string> = {
  format: "That doesn't look like a whole key yet. Copy the full key from AI Studio (use its Copy button) and paste it here.",
  invalid: "Google didn't accept this key. Copy it again from AI Studio and paste it here.",
  not_enabled: "This key's project doesn't have the Gemini API turned on. In AI Studio, create the key again and choose “Create API key in new project”.",
  quota: "This key has used up today's free allowance. It will work again tomorrow, or you can connect another key.",
  network: "Couldn't reach Google. Check your connection and try again.",
};

export class AiError extends Error {
  constructor(public reason: "quota" | "busy" | "key" | "network" | "empty" | "other", public detail?: string) { super(reason); }
}

export const AI_PROBLEM: Record<AiError["reason"], string> = {
  quota: "Your Gemini key has reached Google's free daily limit on every model Lumen can use. It resets within a day.",
  busy: "Google is limiting how fast your key can ask right now. Wait a minute and try again.",
  key: "Google didn't accept your Gemini key. Check it under You → Your tools.",
  network: "Couldn't reach Google. Check your connection and try again.",
  empty: "The AI didn't return anything useful. Try again.",
  other: "Something went wrong with the AI. Try again in a moment.",
};

/**
 * The free models Lumen tries, in order. Google gives each model its own free
 * allowance, so when one is used up (or not offered to a key) the next usually works.
 * The "-latest" names follow Google's current models; the fixed names are fallbacks.
 */
export const MODELS = ["gemini-flash-latest", "gemini-flash-lite-latest", "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"];

export interface RateLimit { kind: "minute" | "day" | "unavailable" | "search" | "unknown"; retryMs?: number; message: string }

/** Reads why Google said 429: a per-minute limit (wait), a daily limit, a model not offered for free, or the search tool's own limit. */
export function readRateLimit(body: unknown): RateLimit {
  const err = (body as { error?: { message?: string; details?: { "@type"?: string; retryDelay?: string; violations?: { quotaId?: string; quotaMetric?: string }[] }[] } })?.error;
  const message = String(err?.message ?? "");
  const details = Array.isArray(err?.details) ? err!.details : [];
  const ids = details.flatMap(d => (d.violations ?? []).map(v => `${v.quotaId ?? ""} ${v.quotaMetric ?? ""}`)).join(" ");
  const delay = details.find(d => d.retryDelay)?.retryDelay;
  const retryMs = delay ? Math.ceil(parseFloat(delay) * 1000) : undefined;
  const text = `${ids} ${message}`;
  let kind: RateLimit["kind"] = "unknown";
  if (/limit:\s*0\b/i.test(message)) kind = "unavailable";
  else if (/search|grounding/i.test(ids)) kind = "search";
  else if (/PerDay|per day|daily/i.test(text)) kind = "day";
  else if (/PerMinute|per minute/i.test(text)) kind = "minute";
  return { kind, retryMs, message: message.slice(0, 300) };
}

// Models that refused today on this device, so later calls skip straight past them.
const skipped = new Map<string, number>();
const SKIP_MS = 6 * 3600_000;
function skip(model: string) {
  skipped.set(model, Date.now());
  try { localStorage.setItem("lumen:ai:skip", JSON.stringify(Object.fromEntries(skipped))); } catch {}
}
function isSkipped(model: string): boolean {
  if (!skipped.size) { try { Object.entries(JSON.parse(localStorage.getItem("lumen:ai:skip") ?? "{}") as Record<string, number>).forEach(([m, t]) => skipped.set(m, t)); } catch {} }
  const t = skipped.get(model);
  return t != null && Date.now() - t < SKIP_MS;
}
/** Forgets which models refused (used by tests, and harmless otherwise). */
export function resetModelSkips() { skipped.clear(); try { localStorage.removeItem("lumen:ai:skip"); } catch {} }

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((res, rej) => {
  const t = setTimeout(res, ms);
  signal?.addEventListener("abort", () => { clearTimeout(t); rej(new DOMException("Aborted", "AbortError")); }, { once: true });
});

type GenOpts = { model?: string; signal?: AbortSignal; search?: boolean; fetcher?: typeof fetch; wait?: (ms: number) => Promise<void> };

/**
 * Asks Gemini. With `search`, Gemini can look things up on Google Search, so suggestions are real and current.
 * When Google says "too many requests" it reads why: it waits and retries a per-minute limit,
 * drops the search tool if only that is limited, and moves on to the next free model otherwise.
 */
export async function generate(key: string, prompt: string, opts: GenOpts = {}): Promise<string> {
  const fetcher = opts.fetcher ?? fetch, wait = opts.wait ?? ((ms: number) => sleep(ms, opts.signal));
  const models = opts.model ? [opts.model] : MODELS;
  const usable = models.filter(m => !isSkipped(m));
  const order = usable.length ? usable : models; // if everything was skipped earlier, try again from the top
  let search = !!opts.search, sawMinute = false, last: RateLimit | null = null;

  for (const model of order) {
    for (let attempt = 0; attempt < 3; attempt++) {
      let res: Response;
      try {
        res = await fetcher(`${BASE}/models/${model}:generateContent`, {
          method: "POST",
          signal: opts.signal,
          headers: { "content-type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], ...(search ? { tools: [{ google_search: {} }] } : {}) }),
        });
      } catch (e) {
        if ((e as Error).name === "AbortError") throw e;
        throw new AiError("network");
      }
      if (res.ok) {
        const j = await res.json();
        const text = (j.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
        if (!text.trim()) throw new AiError("empty");
        return text;
      }
      const body = await res.json().catch(() => ({}));
      if (res.status === 404) break; // this model isn't offered any more: try the next
      if (res.status === 429) {
        const rl = readRateLimit(body); last = rl;
        if (rl.kind === "search" && search) { search = false; continue; }          // answer without live search; links are still checked
        if (rl.kind === "minute" || (rl.kind === "unknown" && attempt === 0)) {
          sawMinute = sawMinute || rl.kind === "minute";
          const ms = Math.min(rl.retryMs ?? 4000 * (attempt + 1), 20_000);
          if (attempt < 2) { await wait(ms); continue; }
        }
        skip(model); break;                                                         // daily limit or not free for this key: next model
      }
      if (res.status === 400 && /not found|not supported|unsupported/i.test(JSON.stringify(body))) break;
      if (res.status === 400 || res.status === 401 || res.status === 403) throw new AiError("key", JSON.stringify(body).slice(0, 300));
      if (res.status >= 500 && attempt < 1) { await wait(2000); continue; }
      throw new AiError("other", `${res.status}`);
    }
  }
  throw new AiError(sawMinute ? "busy" : "quota", last?.message);
}

/** Pulls the first JSON value out of a model reply, ignoring code fences and chatter around it. */
export function extractJson<T = unknown>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  for (const src of [fenced, text].filter(Boolean) as string[]) {
    const start = src.search(/[[{]/);
    if (start < 0) continue;
    const open = src[start], close = open === "[" ? "]" : "}";
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < src.length; i++) {
      const ch = src[i];
      if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
      if (ch === '"') inStr = true;
      else if (ch === open) depth++;
      else if (ch === close && --depth === 0) { try { return JSON.parse(src.slice(start, i + 1)) as T; } catch { break; } }
    }
  }
  return null;
}

export async function generateJson<T>(key: string, prompt: string, opts: Parameters<typeof generate>[2] = {}): Promise<T> {
  const v = extractJson<T>(await generate(key, prompt, opts));
  if (v == null) throw new AiError("empty");
  return v;
}
