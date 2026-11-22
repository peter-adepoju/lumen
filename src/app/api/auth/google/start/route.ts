import { NextResponse, type NextRequest } from "next/server";
import { config, OAUTH_COOKIE, redirectUri, safeNext, SCOPES, YOUTUBE_CONNECT_SCOPES } from "@/lib/server/google";
import { randomToken, seal, sha256b64url } from "@/lib/server/seal";

export async function GET(req: NextRequest) {
  const { clientId, secret, configured } = config();
  if (!configured) return NextResponse.redirect(new URL("/setup?google=not-configured", req.url));
  const state = randomToken(16), verifier = randomToken(48);
  const next = safeNext(req.nextUrl.searchParams.get("next"));
  // "?extra=youtube" connects YouTube: it asks for youtube.readonly entirely on its own, as a
  // separate grant. Google won't put youtube.readonly and Drive on one grant, so this request must
  // NOT send include_granted_scopes (that would fold the existing Drive scope in and be refused).
  const youtube = req.nextUrl.searchParams.get("extra") === "youtube";
  const params: Record<string, string> = {
    client_id: clientId,
    redirect_uri: redirectUri(req.nextUrl.origin),
    response_type: "code",
    scope: (youtube ? YOUTUBE_CONNECT_SCOPES : SCOPES).join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
    code_challenge: await sha256b64url(verifier),
    code_challenge_method: "S256",
  };
  if (!youtube) params.include_granted_scopes = "true";
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams(params).toString();
  const res = NextResponse.redirect(url);
  res.cookies.set(OAUTH_COOKIE, await seal({ state, verifier, next, youtube }, secret), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/auth", maxAge: 600,
  });
  return res;
}
