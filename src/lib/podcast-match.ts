// "Listen instead": many creators publish the same talks as a podcast. These pure functions pick the
// creator's podcast and pair its episodes with videos by title, so a video can be heard as audio
// (which keeps playing with the screen off). Used by the server route and the tests.

export interface PodEpisode { title: string; audio: string; date?: string; seconds?: number; guid?: string }
export interface PodShow { id: number; title: string; author: string; feed: string; artwork?: string }

const STOP = new Set(["the", "a", "an", "and", "of", "to", "in", "on", "for", "with", "by", "is", "at", "from", "episode", "ep", "part", "pt", "full", "sermon", "message", "live", "video", "audio", "podcast", "official", "hd", "service", "sunday", "online"]);

/** The words of a title that identify it: no hashtags, channel suffixes, emoji or filler. */
export function titleWords(t: string): string[] {
  return t.toLowerCase()
    .replace(/#[\p{L}\p{N}_]+/gu, " ")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/).filter(w => w.length > 1 && !STOP.has(w));
}
const numbers = (t: string) => (t.match(/\d+/g) ?? []).map(Number).filter(n => n < 2000);

/** How alike two titles are, 0–1. Different episode numbers never match. */
export function titleScore(a: string, b: string): number {
  const na = numbers(a), nb = numbers(b);
  if (na.length && nb.length && !na.some(n => nb.includes(n))) return 0;
  const wa = new Set(titleWords(a)), wb = new Set(titleWords(b));
  if (!wa.size || !wb.size) return 0;
  let both = 0;
  for (const w of wa) if (wb.has(w)) both++;
  return both / Math.min(wa.size, wb.size) * (0.6 + 0.4 * (both / Math.max(wa.size, wb.size)));
}

const MATCH = 0.62;

/** The best podcast episode for each video title (only clear matches). */
export function pairEpisodes(videos: { key: string; title: string }[], eps: PodEpisode[]): Record<string, PodEpisode> {
  const out: Record<string, PodEpisode> = {};
  const used = new Set<string>();
  for (const v of videos) {
    let best: PodEpisode | null = null, score = 0;
    for (const e of eps) {
      if (used.has(e.audio)) continue;
      const s = titleScore(v.title, e.title);
      if (s > score) { score = s; best = e; }
    }
    if (best && score >= MATCH) { out[v.key] = best; used.add(best.audio); }
  }
  return out;
}

/** How likely a podcast is the creator's own: its name or author against the channel name. */
export function showScore(show: Pick<PodShow, "title" | "author">, creator: string): number {
  const c = new Set(titleWords(creator));
  if (!c.size) return 0;
  const w = new Set([...titleWords(show.author), ...titleWords(show.title)]);
  let both = 0;
  for (const x of c) if (w.has(x)) both++;
  return both / c.size;
}

const decode = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).trim();
const tag = (x: string, name: string) => x.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "i"))?.[1];

function seconds(d?: string): number | undefined {
  if (!d) return undefined;
  const t = decode(d);
  if (/^\d+$/.test(t)) return Number(t);
  const p = t.split(":").map(Number);
  if (p.some(Number.isNaN)) return undefined;
  return p.reduce((a, x) => a * 60 + x, 0);
}

/** Reads a podcast RSS feed: each episode's title, audio file, date and length. */
export function parsePodcastFeed(xml: string): PodEpisode[] {
  const out: PodEpisode[] = [];
  for (const item of xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? []) {
    const audio = item.match(/<enclosure\b[^>]*url=["']([^"']+)["'][^>]*>/i)?.[1];
    const type = item.match(/<enclosure\b[^>]*type=["']([^"']+)["']/i)?.[1] ?? "";
    const title = decode(tag(item, "title") ?? "");
    if (!audio || !title || (type && !/audio|mpeg|mp4|m4a|aac|octet/i.test(type))) continue;
    const url = decode(audio);
    if (!/^https?:\/\//.test(url)) continue;
    const pub = tag(item, "pubDate");
    const date = pub && !Number.isNaN(Date.parse(decode(pub))) ? new Date(decode(pub)).toISOString() : undefined;
    out.push({ title: title.slice(0, 300), audio: url.replace(/^http:/, "https:"), ...(date ? { date } : {}), ...(seconds(tag(item, "itunes:duration")) ? { seconds: seconds(tag(item, "itunes:duration")) } : {}), ...(tag(item, "guid") ? { guid: decode(tag(item, "guid")!).slice(0, 200) } : {}) });
  }
  return out;
}
