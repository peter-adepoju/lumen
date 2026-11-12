import { NextResponse, type NextRequest } from "next/server";
import { config, exchangeCode, idClaims, OAUTH_COOKIE, safeNext, writeSession } from "@/lib/server/google";
import { unseal } from "@/lib/server/seal";

export async function GET(req: NextRequest) {
  const { secret, configured } = config();
  if (!configured) return NextResponse.redirect(new URL("/setup?google=not-configured", req.url));
  const saved = await unseal<{ state: string; verifier: string; next: string }>(req.cookies.get(OAUTH_COOKIE)?.value, secret);
  const p = req.nextUrl.searchParams;
  const fail = (why: string) => {
    const r = NextResponse.redirect(new URL("/setup?google=" + why, req.url));
    r.cookies.delete({ name: OAUTH_COOKIE, path: "/api/auth" });
    return r;
  };
  if (p.get("error")) return fail(p.get("error") === "access_denied" ? "declined" : "error");
  if (!saved || !p.get("code") || p.get("state") !== saved.state) return fail("expired");

  const tok = await exchangeCode(p.get("code")!, saved.verifier, req.nextUrl.origin);
  if (!tok.access_token || !tok.id_token) return fail("error");
  if (!tok.refresh_token) return fail("no-offline");
  if (!(tok as { scope?: string }).scope?.includes("drive.file")) return fail("no-drive");

  const c = idClaims(tok.id_token);
  await writeSession({
    sub: c.sub, email: c.email, name: c.name ?? c.email, picture: c.picture,
    refreshToken: tok.refresh_token, accessToken: tok.access_token, accessExpires: Date.now() + (tok.expires_in - 60) * 1000,
  });
  const res = NextResponse.redirect(new URL(safeNext(saved.next), req.url));
  res.cookies.delete({ name: OAUTH_COOKIE, path: "/api/auth" });
  return res;
}
