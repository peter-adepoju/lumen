import "server-only";
import { parseGutenbergText, wordCount } from "../books/text";
import type { BookDoc } from "../model";

const UA = "Mozilla/5.0 (compatible; LumenLibrary/1.0)";
const BASE = "https://www.gutenberg.org";

export interface GutenbergHit { id: number; title: string; author: string; cover: string }

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").trim();

/** Searches Project Gutenberg's catalogue (public-domain books) through its OPDS feed. */
export function parseOpds(xml: string): GutenbergHit[] {
  const out: GutenbergHit[] = [];
  for (const entry of xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? []) {
    const id = Number(entry.match(/<id>[^<]*\/ebooks\/(\d+)[^<]*<\/id>/)?.[1]);
    const title = entry.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1];
    if (!id || !title) continue;
    const author = entry.match(/<content[^>]*>([\s\S]*?)<\/content>/)?.[1] ?? entry.match(/<name>([\s\S]*?)<\/name>/)?.[1] ?? "";
    out.push({ id, title: decode(title), author: decode(author.replace(/<[^>]+>/g, "")), cover: `${BASE}/cache/epub/${id}/pg${id}.cover.medium.jpg` });
  }
  return out;
}

export async function search(query: string): Promise<GutenbergHit[]> {
  const res = await fetch(`${BASE}/ebooks/search.opds/?query=${encodeURIComponent(query.slice(0, 100))}`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error("gutenberg_unavailable");
  return parseOpds(await res.text()).slice(0, 25);
}

const books = new Map<number, BookDoc & { words: number }>();

export async function fetchBook(id: number): Promise<(BookDoc & { words: number }) | null> {
  if (books.has(id)) return books.get(id)!;
  const res = await fetch(`${BASE}/cache/epub/${id}/pg${id}.txt`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) return null;
  const parsed = parseGutenbergText(await res.text());
  if (!parsed.chapters.length) return null;
  const doc = { id: `pg${id}`, title: parsed.title ?? `Project Gutenberg #${id}`, author: parsed.author ?? "Unknown author", note: "Public domain text from Project Gutenberg", chapters: parsed.chapters, words: wordCount(parsed.chapters) };
  books.set(id, doc);
  if (books.size > 50) books.delete(books.keys().next().value!);
  return doc;
}
