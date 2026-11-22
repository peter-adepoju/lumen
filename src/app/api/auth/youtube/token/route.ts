import { NextResponse } from "next/server";
import { readSession, refreshAccess, writeSession } from "@/lib/server/google";

/**
 * A short-lived Google access token for the user's YouTube data, minted from the separate YouTube
 * grant (kept apart from Drive). The refresh token never leaves the server side of the cookie.
 */
export async function POST() {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  if (!s.youtubeRefreshToken) return NextResponse.json({ error: "not_connected" }, { status: 400 });

  const tok = await refreshAccess(s.youtubeRefreshToken);
  if (!tok.access_token) {
    // The YouTube grant was revoked or expired: forget it so the app can offer to reconnect.
    if (tok.error === "invalid_grant") {
      await writeSession({ ...s, youtube: false, youtubeRefreshToken: undefined });
      return NextResponse.json({ error: "not_connected" }, { status: 400 });
    }
    return NextResponse.json({ error: "google_unavailable" }, { status: 502 });
  }
  return NextResponse.json(
    { accessToken: tok.access_token, expiresAt: Date.now() + (tok.expires_in - 60) * 1000 },
    { headers: { "cache-control": "no-store" } },
  );
}
