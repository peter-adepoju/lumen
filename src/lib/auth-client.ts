"use client";
import { useEffect, useState } from "react";

export interface Me { googleConfigured: boolean; youtube?: boolean; user: { sub: string; email: string; name: string; picture?: string } | null }

let cached: Promise<Me> | null = null;
export function fetchMe(force = false): Promise<Me> {
  if (!cached || force) {
    cached = fetch("/api/auth/me", { cache: "no-store" })
      .then(r => (r.ok ? r.json() : { googleConfigured: false, user: null }))
      .catch(() => ({ googleConfigured: false, user: null }));
  }
  return cached;
}

export function useMe(): Me | null {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => { let on = true; fetchMe().then(m => on && setMe(m)); return () => { on = false; }; }, []);
  return me;
}

export function googleSignInUrl(next: string) {
  return "/api/auth/google/start?next=" + encodeURIComponent(next);
}

/** Sign-in (or re-consent) that also asks for read access to your YouTube subscriptions and likes. */
export function connectYouTubeUrl(next: string) {
  return "/api/auth/google/start?extra=youtube&next=" + encodeURIComponent(next);
}

/** A short-lived access token for the user's YouTube data (a separate grant from Drive). */
export async function getYouTubeToken(): Promise<{ token: string } | { error: "not_connected" | "failed" }> {
  const r = await fetch("/api/auth/youtube/token", { method: "POST" });
  if (r.ok) { const j = await r.json(); return j.accessToken ? { token: j.accessToken } : { error: "failed" }; }
  const j = await r.json().catch(() => ({}));
  return { error: j.error === "not_connected" ? "not_connected" : "failed" };
}

export async function signOut(disconnect = false) {
  await fetch("/api/auth/signout" + (disconnect ? "?disconnect=1" : ""), { method: "POST" });
  cached = null;
}
