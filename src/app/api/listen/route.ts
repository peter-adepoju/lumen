import { NextResponse, type NextRequest } from "next/server";
import { safeFetchText } from "@/lib/server/verify";
import { pairEpisodes, parsePodcastFeed, showScore, type PodShow } from "@/lib/podcast-match";

/**
 * "Listen instead": finds the creator's own podcast (Apple's free podcast directory) and pairs its
 * episodes with the videos you name, by title. Only the creator's name and the titles are sent here.
 * POST { creator, videos: [{ key, title }] } → { show, matches: { key: episode } } or { show: null }.
 */
const hits = new Map<string, { n: number; reset: number }>();
const feeds = new Map<string, { at: number; eps: ReturnType<typeof parsePodcastFeed> }>();

async function searchShows(term: string): Promise<PodShow[]> {
  try {
    const r = await fetch(`https://itunes.apple.com/search?media=podcast&entity=podcast&limit=8&term=${encodeURIComponent(term)}`, { signal: AbortSignal.timeout(7000) });
    if (!r.ok) return [];
    const j = (await r.json()) as { results?: Record<string, unknown>[] };
    return (j.results ?? []).filter(x => typeof x.feedUrl === "string").map(x => ({ id: Number(x.collectionId), title: String(x.collectionName ?? ""), author: String(x.artistName ?? ""), feed: String(x.feedUrl), artwork: typeof x.artworkUrl600 === "string" ? x.artworkUrl600 : undefined }));
  } catch { return []; }
}

async function episodes(feed: string) {
  const hit = feeds.get(feed);
  if (hit && Date.now() - hit.at < 3600_000) return hit.eps;
  const r = await safeFetchText(feed, { accept: "application/rss+xml, application/xml, text/xml", maxBytes: 8_000_000, type: t => /xml|rss|text|octet/i.test(t) || !t, ms: 10_000 });
  const eps = r ? parsePodcastFeed(r.text) : [];
  feeds.set(feed, { at: Date.now(), eps });
  if (feeds.size > 300) feeds.delete(feeds.keys().next().value!);
  return eps;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now(), h = hits.get(ip);
  if (h && h.reset > now && h.n >= 20) return NextResponse.json({ error: "slow_down" }, { status: 429 });
  hits.set(ip, h && h.reset > now ? { n: h.n + 1, reset: h.reset } : { n: 1, reset: now + 60_000 });
  if (hits.size > 10_000) hits.clear();
  let body: { creator?: string; feed?: string; videos?: { key: string; title: string }[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad_request" }, { status: 400 }); }
  const creator = String(body.creator ?? "").slice(0, 120).trim();
  const videos = (Array.isArray(body.videos) ? body.videos : []).slice(0, 400).map(v => ({ key: String(v.key).slice(0, 40), title: String(v.title).slice(0, 300) }));
  if (!videos.length) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  // A podcast found before is tried first; otherwise the creator's name is looked up.
  let shows: PodShow[] = [];
  if (typeof body.feed === "string" && /^https:\/\//.test(body.feed)) shows.push({ id: 0, title: "", author: "", feed: body.feed });
  if (creator) shows.push(...(await searchShows(creator)).filter(s => showScore(s, creator) >= 0.5).slice(0, 4));
  shows = shows.filter((s, i) => shows.findIndex(x => x.feed === s.feed) === i);
  let best: { show: PodShow; matches: ReturnType<typeof pairEpisodes> } | null = null;
  for (const show of shows) {
    const eps = await episodes(show.feed);
    if (!eps.length) continue;
    const matches = pairEpisodes(videos, eps);
    if (!best || Object.keys(matches).length > Object.keys(best.matches).length) best = { show, matches };
    if (Object.keys(matches).length >= Math.ceil(videos.length * 0.8)) break;
  }
  // Nothing under the creator's name: look the first title up, and still only trust the creator's own show.
  if ((!best || !Object.keys(best.matches).length) && creator) {
    for (const show of (await searchShows(videos[0].title)).filter(s => showScore(s, creator) >= 0.5 && !shows.some(x => x.feed === s.feed)).slice(0, 2)) {
      const eps = await episodes(show.feed);
      const matches = pairEpisodes(videos, eps);
      if (Object.keys(matches).length && (!best || Object.keys(matches).length > Object.keys(best.matches).length)) best = { show, matches };
    }
  }
  if (!best || !Object.keys(best.matches).length) return NextResponse.json({ show: best?.show ?? null, matches: {} });
  return NextResponse.json(best);
}
