import { NextResponse } from "next/server";
import { readSession, refreshAccess, writeSession, clearSession } from "@/lib/server/google";

/** A short-lived Google access token for the signed-in user's Drive. The refresh token never leaves the server side of the cookie. */
export async function POST() {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  if (s.accessToken && s.accessExpires && s.accessExpires > Date.now() + 30_000) {
    return NextResponse.json({ accessToken: s.accessToken, expiresAt: s.accessExpires }, { headers: { "cache-control": "no-store" } });
  }
  const tok = await refreshAccess(s.refreshToken);
  if (!tok.access_token) {
    if (tok.error === "invalid_grant") { await clearSession(); return NextResponse.json({ error: "reconnect" }, { status: 401 }); }
    return NextResponse.json({ error: "google_unavailable" }, { status: 502 });
  }
  const next = { ...s, accessToken: tok.access_token, accessExpires: Date.now() + (tok.expires_in - 60) * 1000 };
  await writeSession(next);
  return NextResponse.json({ accessToken: next.accessToken, expiresAt: next.accessExpires }, { headers: { "cache-control": "no-store" } });
}
