// The user's own Gemini key. Calls go from the device straight to Google; Lumen's servers never see the key.

export const AI_STUDIO_URL = "https://aistudio.google.com/apikey";
const BASE = "https://generativelanguage.googleapis.com/v1beta";
export const DEFAULT_MODEL = "gemini-flash-latest";

/**
 * Gemini API keys from Google AI Studio come in two shapes: the classic one
 * (39 characters, starting "AIza") and the newer one (starting "AQ.", longer).
 * This only catches obvious paste mistakes; Google's own check decides if a key works.
 */
export function looksLikeKey(k: string): boolean {
  const t = k.trim();
  return /^AIza[0-9A-Za-z_-]{35}$/.test(t) || /^AQ\.[0-9A-Za-z._-]{20,400}$/.test(t);
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
  format: "That doesn't look like a Gemini key yet. It starts with AQ. or AIza. Copy the whole key from AI Studio and paste it here.",
  invalid: "Google didn't accept this key. Copy it again from AI Studio and paste it here.",
  not_enabled: "This key's project doesn't have the Gemini API turned on. In AI Studio, create the key again and choose “Create API key in new project”.",
  quota: "This key has used up today's free allowance. It will work again tomorrow, or you can connect another key.",
  network: "Couldn't reach Google. Check your connection and try again.",
};

export class AiError extends Error {
  constructor(public reason: "quota" | "key" | "network" | "empty" | "other") { super(reason); }
}

export const AI_PROBLEM: Record<AiError["reason"], string> = {
  quota: "Your Gemini key has used today's free allowance. Picks will work again tomorrow.",
  key: "Google didn't accept your Gemini key. Check it under You → Your tools.",
  network: "Couldn't reach Google. Check your connection and try again.",
  empty: "The AI didn't return anything useful. Try again.",
  other: "Something went wrong with the AI. Try again in a moment.",
};

/** Asks Gemini. With `search`, Gemini can look things up on Google Search, so suggestions are real and current. */
export async function generate(key: string, prompt: string, opts: { model?: string; signal?: AbortSignal; search?: boolean; fetcher?: typeof fetch } = {}): Promise<string> {
  let res: Response;
  try {
    res = await (opts.fetcher ?? fetch)(`${BASE}/models/${opts.model ?? DEFAULT_MODEL}:generateContent`, {
      method: "POST",
      signal: opts.signal,
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], ...(opts.search ? { tools: [{ google_search: {} }] } : {}) }),
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new AiError("network");
  }
  if (res.status === 429) throw new AiError("quota");
  if (res.status === 400 || res.status === 401 || res.status === 403) throw new AiError("key");
  if (!res.ok) throw new AiError("other");
  const j = await res.json();
  const text = (j.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
  if (!text.trim()) throw new AiError("empty");
  return text;
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
