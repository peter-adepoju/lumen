import { NextResponse, type NextRequest } from "next/server";
import { config, exchangeCode, idClaims, OAUTH_COOKIE, readSession, safeNext, writeSession } from "@/lib/server/google";
import { unseal } from "@/lib/server/seal";

export async function GET(req: NextRequest) {
  const { secret, configured } = config();
  if (!configured) return NextResponse.redirect(new URL("/setup?google=not-configured", req.url));
  const saved = await unseal<{ state: string; verifier: string; next: string; youtube?: boolean }>(req.cookies.get(OAUTH_COOKIE)?.value, secret);
  const p = req.nextUrl.searchParams;
  const done = (why: string) => {
    const r = NextResponse.redirect(new URL(why.startsWith("/") ? why : "/setup?google=" + why, req.url));
    r.cookies.delete({ name: OAUTH_COOKIE, path: "/api/auth" });
    return r;
  };
  if (p.get("error")) return done(p.get("error") === "access_denied" ? "declined" : "error");
  if (!saved || !p.get("code") || p.get("state") !== saved.state) return done("expired");

  const tok = await exchangeCode(p.get("code")!, saved.verifier, req.nextUrl.origin);

  // Connecting YouTube: a separate grant. Attach its refresh token to the existing session, and
  // leave Drive (and everything else) exactly as it was.
  if (saved.youtube) {
    const sess = await readSession();
    if (!sess) return done("expired");
    if (!tok.refresh_token) return done("no-offline");
    await writeSession({ ...sess, youtube: true, youtubeRefreshToken: tok.refresh_token });
    return done(safeNext(saved.next));
  }

  // Normal sign-in: build the session from Google's reply.
  if (!tok.access_token || !tok.id_token) return done("error");
  if (!tok.refresh_token) return done("no-offline");
  if (!((tok as { scope?: string }).scope ?? "").includes("drive.file")) return done("no-drive");

  const c = idClaims(tok.id_token);
  const prev = await readSession();
  // Keep a YouTube connection the same account made earlier, so re-signing in to Drive doesn't drop it.
  const keepYt = prev && prev.sub === c.sub && prev.youtubeRefreshToken ? { youtube: true, youtubeRefreshToken: prev.youtubeRefreshToken } : {};
  await writeSession({
    sub: c.sub, email: c.email, name: c.name ?? c.email, picture: c.picture,
    refreshToken: tok.refresh_token, accessToken: tok.access_token, accessExpires: Date.now() + (tok.expires_in - 60) * 1000,
    ...keepYt,
  });
  return done(safeNext(saved.next));
}
