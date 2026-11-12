"use client";
import { useEffect, useState } from "react";

export interface Me { googleConfigured: boolean; user: { sub: string; email: string; name: string; picture?: string } | null }

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

export async function signOut(disconnect = false) {
  await fetch("/api/auth/signout" + (disconnect ? "?disconnect=1" : ""), { method: "POST" });
  cached = null;
}
