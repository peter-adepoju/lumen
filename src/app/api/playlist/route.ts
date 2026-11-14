import { NextResponse, type NextRequest } from "next/server";
import { playlist } from "@/lib/server/playlist";

/** A YouTube playlist's episodes, oldest first. It sees only the playlist id. */
const hits = new Map<string, { n: number; reset: number }>();

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now(), h = hits.get(ip);
  if (h && h.reset > now && h.n >= 30) return NextResponse.json({ error: "slow_down" }, { status: 429 });
  hits.set(ip, h && h.reset > now ? { n: h.n + 1, reset: h.reset } : { n: 1, reset: now + 60_000 });
  if (hits.size > 10_000) hits.clear();
  const id = req.nextUrl.searchParams.get("list") ?? "";
  if (!/^[\w-]{10,64}$/.test(id) || id.startsWith("RD")) return NextResponse.json({ error: "bad_list" }, { status: 400 });
  try {
    const p = await playlist(id);
    if (!p) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json(p, { headers: { "cache-control": "public, s-maxage=900, stale-while-revalidate=3600" } });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
}
