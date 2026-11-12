import { NextResponse, type NextRequest } from "next/server";
import { clearSession, readSession, revoke } from "@/lib/server/google";

/** Signs out. With ?disconnect=1 it also revokes Lumen's access to the user's Google account. */
export async function POST(req: NextRequest) {
  const s = await readSession();
  if (s && req.nextUrl.searchParams.get("disconnect") === "1") await revoke(s.refreshToken);
  await clearSession();
  return NextResponse.json({ ok: true });
}
