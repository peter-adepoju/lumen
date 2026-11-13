import { NextResponse, type NextRequest } from "next/server";
import { headlines } from "@/lib/server/news";

/**
 * Today's headlines for one news topic, from Google News's free feeds.
 * It sees only the topic and source names, never who is asking or anything else about them.
 */
const hits = new Map<string, { n: number; reset: number }>();
const LIMIT = 30; // topics per minute per address

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now(), h = hits.get(ip);
  if (h && h.reset > now && h.n >= LIMIT) return NextResponse.json({ error: "slow_down" }, { status: 429 });
  hits.set(ip, h && h.reset > now ? { n: h.n + 1, reset: h.reset } : { n: 1, reset: now + 60_000 });
  if (hits.size > 10_000) hits.clear();
  const topic = (req.nextUrl.searchParams.get("topic") ?? "").slice(0, 80).trim();
  const sources = (req.nextUrl.searchParams.get("sources") ?? "").split(",").map(s => s.trim()).filter(Boolean).slice(0, 20);
  if (topic.length < 2) return NextResponse.json({ error: "no_topic" }, { status: 400 });
  try {
    return NextResponse.json({ items: await headlines(topic, sources) }, { headers: { "cache-control": "public, s-maxage=900, stale-while-revalidate=1800" } });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
}
