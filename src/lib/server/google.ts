import "server-only";
import { cookies } from "next/headers";
import { seal, unseal } from "./seal";

/** Who you are. */
export const ID_SCOPES = ["openid", "email", "profile"];
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
/** What Lumen asks Google for at sign-in: who you are, and access to files Lumen itself creates in your Drive. */
export const SCOPES = [...ID_SCOPES, DRIVE_SCOPE];
/** Added only when you choose to connect YouTube: read-only access to your subscriptions and likes. */
export const YOUTUBE_SCOPE = "https://www.googleapis.com/auth/youtube.readonly";
/**
 * Google won't put drive.file and youtube.readonly on one grant, so the YouTube connect asks for
 * youtube.readonly entirely on its own (and must NOT send include_granted_scopes, or Google would
 * fold the existing Drive scope back in and refuse the pair). This mints a separate refresh token.
 */
export const YOUTUBE_CONNECT_SCOPES = [YOUTUBE_SCOPE];

export const SESSION_COOKIE = "lumen_session";
export const OAUTH_COOKIE = "lumen_oauth";
const SESSION_MAX_AGE = 60 * 60 * 24 * 180; // 180 days

export interface Session {
  sub: string;
  email: string;
  name: string;
  picture?: string;
  refreshToken: string;
  accessToken?: string;
  accessExpires?: number; // ms since epoch
  youtube?: boolean; // the user granted read access to their YouTube subscriptions and likes
  youtubeRefreshToken?: string; // a separate grant for YouTube, kept apart from Drive (see YOUTUBE_CONNECT_SCOPES)
}

export function config() {
  const clientId = process.env.GOOGLE_CLIENT_ID ?? "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? "";
  const secret = process.env.SESSION_SECRET ?? "";
  return { clientId, clientSecret, secret, configured: !!(clientId && clientSecret && secret.length >= 32) };
}

export function redirectUri(origin: string) {
  return (process.env.APP_URL || origin).replace(/\/$/, "") + "/api/auth/google/callback";
}

export async function readSession(): Promise<Session | null> {
  const { secret, configured } = config();
  if (!configured) return null;
  const jar = await cookies();
  return unseal<Session>(jar.get(SESSION_COOKIE)?.value, secret);
}

export async function writeSession(s: Session) {
  const { secret } = config();
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await seal(s, secret), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_MAX_AGE,
  });
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

interface TokenResponse { access_token: string; expires_in: number; refresh_token?: string; id_token?: string; error?: string; error_description?: string }

export async function exchangeCode(code: string, verifier: string, origin: string): Promise<TokenResponse> {
  const { clientId, clientSecret } = config();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri(origin), grant_type: "authorization_code", code_verifier: verifier }),
  });
  return res.json();
}

export async function refreshAccess(refreshToken: string): Promise<TokenResponse> {
  const { clientId, clientSecret } = config();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
  });
  return res.json();
}

export async function revoke(token: string) {
  await fetch("https://oauth2.googleapis.com/revoke?token=" + encodeURIComponent(token), { method: "POST" }).catch(() => {});
}

/** Reads the profile claims from Google's ID token. The token came straight from Google over TLS in exchangeCode, so its signature isn't re-verified here. */
export function idClaims(idToken: string): { sub: string; email: string; name?: string; picture?: string } {
  const part = idToken.split(".")[1] ?? "";
  const json = Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  return JSON.parse(json);
}

/** Only same-site paths are allowed as the place to return to after sign-in. */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/setup";
  return next;
}
