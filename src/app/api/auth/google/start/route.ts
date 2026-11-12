import { NextResponse, type NextRequest } from "next/server";
import { config, OAUTH_COOKIE, redirectUri, safeNext, SCOPES } from "@/lib/server/google";
import { randomToken, seal, sha256b64url } from "@/lib/server/seal";

export async function GET(req: NextRequest) {
  const { clientId, secret, configured } = config();
  if (!configured) return NextResponse.redirect(new URL("/setup?google=not-configured", req.url));
  const state = randomToken(16), verifier = randomToken(48);
  const next = safeNext(req.nextUrl.searchParams.get("next"));
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(req.nextUrl.origin),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
    code_challenge: await sha256b64url(verifier),
    code_challenge_method: "S256",
  }).toString();
  const res = NextResponse.redirect(url);
  res.cookies.set(OAUTH_COOKIE, await seal({ state, verifier, next }, secret), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/auth", maxAge: 600,
  });
  return res;
}
