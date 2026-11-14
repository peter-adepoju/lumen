import "server-only";
// A YouTube playlist's episodes, from its public page (no key): every video in playlist order,
// with each one's age, plus exact upload times from the playlist's feed for the newest ones.
// Lumen uses this to play a playlist oldest-to-newest and to notice new episodes.

import type { Episode } from "../model";
export type { Episode };
export interface PlaylistInfo { id: string; title: string; channel: string; episodes: Episode[]; at: number }

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const cache = new Map<string, { at: number; v: PlaylistInfo }>();
const FRESH = 30 * 60_000;

type J = Record<string, unknown>;
const text = (v: unknown): string => {
  const o = v as J | undefined;
  if (!o) return "";
  if (typeof o.simpleText === "string") return o.simpleText;
  if (Array.isArray(o.runs)) return (o.runs as J[]).map(r => String(r.text ?? "")).join("");
  if (typeof o.content === "string") return o.content;
  return "";
};

/** Pulls a JSON object assigned in the page, e.g. `var ytInitialData = {...};`. */
export function pageJson(html: string, name: string): J | null {
  const at = html.search(new RegExp(`(?:var |window\\[["'])${name}(?:["']\\])?\\s*=\\s*\\{`));
  if (at < 0) return null;
  const start = html.indexOf("{", at);
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) { try { return JSON.parse(html.slice(start, i + 1)); } catch { return null; } }
  }
  return null;
}

/** "3 weeks ago", "Streamed 2 years ago" → an approximate ISO date. */
export function relativeDate(s: string, now = Date.now()): string | undefined {
  const m = s.match(/(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/i);
  if (!m) return undefined;
  const n = Number(m[1]);
  const unit = { second: 1e3, minute: 6e4, hour: 36e5, day: 864e5, week: 6048e5, month: 2592e6, year: 31536e6 }[m[2].toLowerCase() as "day"];
  return new Date(now - n * unit).toISOString();
}

/** Every video in playlist page data (old and new page layouts), and the token for the next page. */
export function readVideos(data: unknown, now = Date.now()): { videos: Episode[]; next?: string } {
  const videos: Episode[] = [];
  let next: string | undefined;
  const seen = new Set<string>();
  const walk = (o: unknown, depth = 0): void => {
    if (!o || typeof o !== "object" || depth > 40) return;
    if (Array.isArray(o)) { o.forEach(x => walk(x, depth + 1)); return; }
    const j = o as J;
    const pv = j.playlistVideoRenderer as J | undefined;
    if (pv && typeof pv.videoId === "string" && !seen.has(pv.videoId)) {
      seen.add(pv.videoId);
      const info = text(pv.videoInfo);
      const date = relativeDate(info, now);
      const title = text(pv.title);
      if (title && !/^\[(private|deleted) video\]$/i.test(title)) videos.push({ id: pv.videoId, title: title.slice(0, 200), ...(pv.lengthSeconds ? { seconds: Number(pv.lengthSeconds) } : {}), ...(date ? { date, approx: true } : {}) });
      return;
    }
    const lv = j.lockupViewModel as J | undefined;
    if (lv && typeof lv.contentId === "string" && /^[\w-]{11}$/.test(lv.contentId) && !seen.has(lv.contentId)) {
      seen.add(lv.contentId);
      const meta = ((lv.metadata as J)?.lockupMetadataViewModel ?? {}) as J;
      const title = text(meta.title);
      const rows = JSON.stringify(meta.metadata ?? {});
      const date = relativeDate(rows, now);
      if (title) videos.push({ id: lv.contentId, title: title.slice(0, 200), ...(date ? { date, approx: true } : {}) });
      return;
    }
    const cont = j.continuationItemRenderer as J | undefined;
    if (cont) {
      const tok = JSON.stringify(cont).match(/"token":"([^"]+)"/)?.[1];
      if (tok) next = tok;
      return;
    }
    for (const v of Object.values(j)) walk(v, depth + 1);
  };
  walk(data);
  return { videos, next };
}

/** The playlist's name and owner from its page data. */
export function readHeader(data: J): { title: string; channel: string } {
  const s = JSON.stringify(data.metadata ?? {}) + JSON.stringify(data.header ?? {});
  const title = (data.metadata as J | undefined)?.playlistMetadataRenderer as J | undefined;
  const ownerMatch = s.match(/"ownerText":\{"runs":\[\{"text":"([^"]+)"/) ?? s.match(/"text":\{"content":"by ([^"]+)"/);
  return { title: String(title?.title ?? s.match(/"title":\{"simpleText":"([^"]+)"/)?.[1] ?? ""), channel: ownerMatch?.[1] ?? "" };
}

/** Exact upload times for up to the 15 newest videos, from the playlist's public feed. */
export function feedDates(xml: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const e of xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? []) {
    const id = e.match(/<yt:videoId>([\w-]{11})<\/yt:videoId>/)?.[1], d = e.match(/<published>([^<]+)<\/published>/)?.[1];
    if (id && d && !Number.isNaN(Date.parse(d))) m.set(id, new Date(d).toISOString());
  }
  return m;
}

/**
 * Oldest first. The playlist's own order is kept (creators number their episodes); if the playlist
 * runs newest-first, it's turned round. The direction is read from the dates the page gives.
 */
export function oldestFirst(eps: Episode[]): Episode[] {
  const dated = eps.map((e, i) => ({ i, t: e.date ? Date.parse(e.date) : NaN })).filter(x => !Number.isNaN(x.t));
  if (dated.length < 2) return eps;
  // Compare the earlier and later halves of the playlist, so a few odd dates don't decide it.
  const half = Math.floor(dated.length / 2);
  const avg = (xs: { t: number }[]) => xs.reduce((a, x) => a + x.t, 0) / xs.length;
  const first = avg(dated.slice(0, Math.max(1, half))), last = avg(dated.slice(Math.max(1, half)));
  return first > last ? [...eps].reverse() : eps;
}

async function get(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...init, headers: { "user-agent": UA, "accept-language": "en-GB,en;q=0.9", ...(init.headers ?? {}) }, signal: AbortSignal.timeout(10_000) });
}

export async function playlist(id: string): Promise<PlaylistInfo | null> {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < FRESH) return hit.v;
  const page = await get(`https://www.youtube.com/playlist?list=${encodeURIComponent(id)}&hl=en&gl=GB`);
  if (!page.ok) return null;
  const html = (await page.text()).slice(0, 6_000_000);
  const data = pageJson(html, "ytInitialData");
  if (!data) return null;
  const head = readHeader(data);
  let { videos, next } = readVideos(data);
  // More than 100 videos: ask for the next pages, as the page itself does.
  const key = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1], version = html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/)?.[1];
  for (let n = 0; next && key && version && n < 9; n++) {
    try {
      const r = await get(`https://www.youtube.com/youtubei/v1/browse?key=${key}&prettyPrint=false`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ context: { client: { clientName: "WEB", clientVersion: version, hl: "en", gl: "GB" } }, continuation: next }),
      });
      if (!r.ok) break;
      const more = readVideos(await r.json());
      const have = new Set(videos.map(v => v.id));
      videos = [...videos, ...more.videos.filter(v => !have.has(v.id))];
      next = more.next;
    } catch { break; }
  }
  try {
    const f = await get(`https://www.youtube.com/feeds/videos.xml?playlist_id=${encodeURIComponent(id)}`);
    if (f.ok) {
      const exact = feedDates(await f.text());
      videos = videos.map(v => (exact.has(v.id) ? { ...v, date: exact.get(v.id), approx: false } : v));
    }
  } catch {}
  if (!videos.length) return null;
  const v: PlaylistInfo = { id, title: head.title, channel: head.channel, episodes: oldestFirst(videos).slice(0, 1000), at: Date.now() };
  cache.set(id, { at: Date.now(), v });
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  return v;
}
