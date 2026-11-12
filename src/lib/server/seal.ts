// Seals a small JSON object into an opaque string with AES-256-GCM.
// Used for the session cookie, so a Google refresh token can live in the
// user's own browser instead of a Lumen database.

const enc = new TextEncoder();
const dec = new TextDecoder();

function toB64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

async function keyFrom(secret: string): Promise<CryptoKey> {
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  const hash = await crypto.subtle.digest("SHA-256", enc.encode(secret));
  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function seal(value: unknown, secret: string): Promise<string> {
  const key = await keyFrom(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(value))));
  return "v1." + toB64url(iv) + "." + toB64url(data);
}

export async function unseal<T>(token: string | undefined | null, secret: string): Promise<T | null> {
  if (!token) return null;
  const [v, ivs, ds] = token.split(".");
  if (v !== "v1" || !ivs || !ds) return null;
  try {
    const key = await keyFrom(secret);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64url(ivs) as BufferSource }, key, fromB64url(ds) as BufferSource);
    return JSON.parse(dec.decode(plain)) as T;
  } catch {
    return null;
  }
}

export function randomToken(bytes = 32): string {
  return toB64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256b64url(s: string): Promise<string> {
  return toB64url(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s))));
}
