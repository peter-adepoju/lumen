import "server-only";
// News videos from YouTube channels (Sky Sports, BBC News, a club's own channel, an outlet's channel…),
// through YouTube's free public channel feeds: no key, no billing, only real published videos.

export interface Video { id: string; title: string; channel: string; channelId: string; date: string; thumb: string; url: string }

const UA = "Mozilla/5.0 (compatible; LumenNews/1.0)";
const ids = new Map<string, string | null>();            // channel reference → channel id
const feeds = new Map<string, { at: number; v: Video[] }>();
const FRESH = 10 * 60_000;

/** "youtube.com/@SkySportsNews", "@SkySportsNews", "youtube.com/channel/UC…" → a reference we can look up. */
export function channelRef(s: string): { id?: string; handle?: string; user?: string } | null {
  const t = s.trim().replace(/^https?:\/\//, "").replace(/^(www\.|m\.)/, "");
  const id = t.match(/(?:youtube\.com\/channel\/)?(UC[A-Za-z0-9_-]{22})\b/);
  if (id) return { id: id[1] };
  const h = t.match(/^(?:youtube\.com\/)?@([A-Za-z0-9._-]{3,100})/);
  if (h) return { handle: h[1] };
  const u = t.match(/^youtube\.com\/(?:c|user)\/([A-Za-z0-9._-]{2,100})/);
  if (u) return { user: u[1] };
  return null;
}

/** The channel id written into a channel page. */
export function channelIdFromPage(html: string): string | null {
  return html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})"/)?.[1]
    ?? html.match(/"externalId":"(UC[A-Za-z0-9_-]{22})"/)?.[1]
    ?? html.match(/"channelId":"(UC[A-Za-z0-9_-]{22})"/)?.[1]
    ?? null;
}

async function resolve(ref: string): Promise<string | null> {
  const r = channelRef(ref);
  if (!r) return null;
  if (r.id) return r.id;
  const key = (r.handle ?? r.user)!.toLowerCase();
  if (ids.has(key)) return ids.get(key)!;
  const url = r.handle ? `https://www.youtube.com/@${encodeURIComponent(r.handle)}` : `https://www.youtube.com/c/${encodeURIComponent(r.user!)}`;
  try {
    const res = await fetch(url, { headers: { "user-agent": UA, "accept-language": "en-GB,en;q=0.8" }, signal: AbortSignal.timeout(8000) });
    const id = res.ok ? channelIdFromPage((await res.text()).slice(0, 1_500_000)) : null;
    ids.set(key, id);
    if (ids.size > 2000) ids.clear();
    return id;
  } catch { return null; }
}

const decode = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).trim();

/** Reads a YouTube channel feed (Atom). Shorts are kept; premieres not yet live are dropped. */
export function parseVideoFeed(xml: string): Video[] {
  const channel = decode(xml.match(/<feed[\s\S]*?<title>([\s\S]*?)<\/title>/)?.[1] ?? "");
  const channelId = xml.match(/<yt:channelId>(UC[A-Za-z0-9_-]{22})<\/yt:channelId>/)?.[1] ?? "";
  const out: Video[] = [];
  for (const e of xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? []) {
    const id = e.match(/<yt:videoId>([A-Za-z0-9_-]{11})<\/yt:videoId>/)?.[1];
    const title = decode(e.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "");
    const date = e.match(/<published>([^<]+)<\/published>/)?.[1] ?? "";
    const views = Number(e.match(/<media:statistics views="(\d+)"/)?.[1] ?? "1");
    if (!id || !title || Number.isNaN(Date.parse(date))) continue;
    if (views === 0 && Date.parse(date) > Date.now()) continue; // an upcoming premiere
    out.push({ id, title: title.slice(0, 200), channel: decode(e.match(/<author>\s*<name>([\s\S]*?)<\/name>/)?.[1] ?? channel).slice(0, 80), channelId, date: new Date(date).toISOString(), thumb: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`, url: `https://www.youtube.com/watch?v=${id}` });
  }
  return out;
}

async function feed(channelId: string): Promise<Video[]> {
  const hit = feeds.get(channelId);
  if (hit && Date.now() - hit.at < FRESH) return hit.v;
  const r = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error("feed " + r.status);
  const v = parseVideoFeed((await r.text()).slice(0, 2_000_000));
  feeds.set(channelId, { at: Date.now(), v });
  if (feeds.size > 1000) feeds.clear();
  return v;
}

/** Videos from the last `days` days across the given channels, newest first. Channels that fail are skipped. */
export async function channelVideos(refs: string[], days = 3): Promise<{ videos: Video[]; unknown: string[] }> {
  const since = Date.now() - days * 86400_000;
  const unknown: string[] = [];
  const lists = await Promise.all(refs.slice(0, 12).map(async ref => {
    const id = await resolve(ref);
    if (!id) { unknown.push(ref); return []; }
    try { return await feed(id); } catch { return []; }
  }));
  const seen = new Set<string>();
  const videos = lists.flat().filter(v => Date.parse(v.date) >= since && !seen.has(v.id) && (seen.add(v.id), true)).sort((a, b) => b.date.localeCompare(a.date));
  return { videos: videos.slice(0, 60), unknown };
}
