import "server-only";
// Live headlines for a news topic from Google News's free RSS feeds. No key, no billing,
// and every item is a real, published article (title, link, outlet, time).

export interface Headline { title: string; url: string; source: string; sourceUrl?: string; date?: string }

const UA = "Mozilla/5.0 (compatible; LumenNews/1.0)";
const cache = new Map<string, { at: number; v: Headline[] }>();
const FRESH = 15 * 60_000;

/** Website sources ("bbc.co.uk", "https://www.manutd.com/news") as bare hosts. X accounts can't be read through Google News. */
export function siteSources(sources: string[]): string[] {
  return [...new Set(sources.map(s => s.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]))]
    .filter(h => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(h) && h !== "x.com" && h !== "twitter.com");
}

/** The Google News search: the topic as a phrase, from the last two days, limited to the trusted sites if any. */
export function newsQuery(topic: string, sources: string[]): string {
  const sites = siteSources(sources);
  const phrase = `"${topic.replace(/"/g, "").trim()}"`;
  return [phrase, "when:2d", sites.length ? `(${sites.map(s => `site:${s}`).join(" OR ")})` : ""].filter(Boolean).join(" ");
}

const decode = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).trim();
const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "i"))?.[1];

/** Reads a Google News RSS feed. Titles come as "Headline - Outlet"; the outlet is split off. */
export function parseFeed(xml: string): Headline[] {
  const out: Headline[] = [];
  for (const item of xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? []) {
    const raw = decode(tag(item, "title") ?? ""), url = decode(tag(item, "link") ?? "");
    const srcTag = item.match(/<source\b([^>]*)>([\s\S]*?)<\/source>/i);
    const source = srcTag ? decode(srcTag[2]) : raw.split(" - ").pop() ?? "";
    const sourceUrl = srcTag?.[1].match(/url=["']([^"']+)["']/)?.[1];
    const title = source && raw.endsWith(" - " + source) ? raw.slice(0, -(source.length + 3)).trim() : raw;
    const pub = tag(item, "pubDate"), date = pub && !Number.isNaN(Date.parse(decode(pub))) ? new Date(decode(pub)).toISOString() : undefined;
    if (title && /^https:\/\//.test(url)) out.push({ title: title.slice(0, 200), url, source: source.slice(0, 80), sourceUrl, date });
  }
  return out;
}

/** Keeps items from the trusted sites (when there are any), drops repeats of the same headline, newest first. */
export function cleanHeadlines(items: Headline[], sources: string[], limit = 20): Headline[] {
  const sites = siteSources(sources), seen = new Set<string>();
  const host = (u?: string) => { try { return u ? new URL(u).hostname.replace(/^www\./, "") : ""; } catch { return ""; } };
  return items
    .filter(h => !sites.length || sites.some(s => { const hh = host(h.sourceUrl); return hh === s || hh.endsWith("." + s); }))
    .filter(h => { const k = h.title.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").slice(0, 70); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
    .slice(0, limit);
}

export async function headlines(topic: string, sources: string[]): Promise<Headline[]> {
  const q = newsQuery(topic, sources), key = q;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < FRESH) return hit.v;
  const url = "https://news.google.com/rss/search?" + new URLSearchParams({ q, hl: "en-GB", gl: "GB", ceid: "GB:en" });
  const r = await fetch(url, { headers: { "user-agent": UA, accept: "application/rss+xml, application/xml" }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error("feed " + r.status);
  const xml = (await r.text()).slice(0, 2_000_000);
  const v = cleanHeadlines(parseFeed(xml), sources);
  cache.set(key, { at: Date.now(), v });
  if (cache.size > 500) cache.clear();
  return v;
}
