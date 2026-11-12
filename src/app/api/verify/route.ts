import { NextResponse, type NextRequest } from "next/server";
import { verify, type Candidate } from "@/lib/server/verify";

/**
 * Checks that suggested links are real and fills in title, creator and thumbnail.
 * It sees only public links, never anyone's data or AI key.
 */
const hits = new Map<string, { n: number; reset: number }>();
const LIMIT = 60; // links per minute per address

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now(), h = hits.get(ip);
  const body = await req.json().catch(() => null) as { items?: Candidate[] } | null;
  const items = Array.isArray(body?.items) ? body!.items.slice(0, 20) : [];
  if (!items.length) return NextResponse.json({ error: "no_items" }, { status: 400 });
  if (h && h.reset > now && h.n + items.length > LIMIT) return NextResponse.json({ error: "slow_down" }, { status: 429 });
  hits.set(ip, h && h.reset > now ? { n: h.n + items.length, reset: h.reset } : { n: items.length, reset: now + 60_000 });
  if (hits.size > 10_000) hits.clear();

  const clean = items.map(c => ({
    url: typeof c?.url === "string" ? c.url.slice(0, 2000) : undefined,
    kind: typeof c?.kind === "string" ? c.kind : undefined,
    title: typeof c?.title === "string" ? c.title.slice(0, 300) : undefined,
    creator: typeof c?.creator === "string" ? c.creator.slice(0, 200) : undefined,
  })) as Candidate[];
  const out = await Promise.all(clean.map(c => verify(c).catch(() => null)));
  return NextResponse.json({ items: out }, { headers: { "cache-control": "no-store" } });
}
