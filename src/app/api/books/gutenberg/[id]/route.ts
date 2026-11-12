import { NextResponse, type NextRequest } from "next/server";
import { fetchBook } from "@/lib/server/gutenberg";

/** One public-domain book from Project Gutenberg, in Lumen's reading format. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "bad_id" }, { status: 400 });
  try {
    const book = await fetchBook(id);
    if (!book) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json(book, { headers: { "cache-control": "public, max-age=86400" } });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
}
