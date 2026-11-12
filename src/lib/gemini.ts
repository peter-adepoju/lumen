// The user's own Gemini key. Calls go from the device straight to Google; Lumen's servers never see the key.

export const AI_STUDIO_URL = "https://aistudio.google.com/apikey";
const BASE = "https://generativelanguage.googleapis.com/v1beta";
export const DEFAULT_MODEL = "gemini-flash-latest";

/** Gemini API keys are 39 characters and start with "AIza". */
export function looksLikeKey(k: string): boolean {
  return /^AIza[0-9A-Za-z_-]{35}$/.test(k.trim());
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
  format: "That doesn't look like a Gemini key yet. It starts with AIza and is 39 characters long.",
  invalid: "Google didn't accept this key. Copy it again from AI Studio and paste it here.",
  not_enabled: "This key's project doesn't have the Gemini API turned on. In AI Studio, create the key again and choose “Create API key in new project”.",
  quota: "This key has used up today's free allowance. It will work again tomorrow, or you can connect another key.",
  network: "Couldn't reach Google. Check your connection and try again.",
};

export async function generate(key: string, prompt: string, opts: { model?: string; signal?: AbortSignal } = {}): Promise<string> {
  const res = await fetch(`${BASE}/models/${opts.model ?? DEFAULT_MODEL}:generateContent`, {
    method: "POST",
    signal: opts.signal,
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] }),
  });
  if (!res.ok) throw new Error(res.status === 429 ? "quota" : "ai_error");
  const j = await res.json();
  return (j.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
}
