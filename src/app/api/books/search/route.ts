import { NextResponse, type NextRequest } from "next/server";
import { search } from "@/lib/server/gutenberg";

/** Searches free, public-domain books on Project Gutenberg. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ items: [] });
  try {
    return NextResponse.json({ items: await search(q) }, { headers: { "cache-control": "public, max-age=3600" } });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
}
