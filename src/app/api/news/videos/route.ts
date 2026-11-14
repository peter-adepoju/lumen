import { NextResponse, type NextRequest } from "next/server";
import { channelVideos } from "@/lib/server/videos";

/**
 * The latest videos from a few YouTube channels (the news topic's video sources), from YouTube's
 * free public feeds. It sees only channel names, never who is asking.
 */
const hits = new Map<string, { n: number; reset: number }>();
const LIMIT = 30;

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now(), h = hits.get(ip);
  if (h && h.reset > now && h.n >= LIMIT) return NextResponse.json({ error: "slow_down" }, { status: 429 });
  hits.set(ip, h && h.reset > now ? { n: h.n + 1, reset: h.reset } : { n: 1, reset: now + 60_000 });
  if (hits.size > 10_000) hits.clear();
  const channels = (req.nextUrl.searchParams.get("channels") ?? "").split(",").map(s => s.trim()).filter(Boolean).slice(0, 12);
  if (!channels.length) return NextResponse.json({ videos: [], unknown: [] });
  try {
    return NextResponse.json(await channelVideos(channels), { headers: { "cache-control": "public, s-maxage=600, stale-while-revalidate=1200" } });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
}
