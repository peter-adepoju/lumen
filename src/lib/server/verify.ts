import "server-only";
import { lookup } from "node:dns/promises";
import { classify, isPrivateAddress, itemId, youtubeIds } from "../links";
import type { Item, ItemKind } from "../model";

/** What the AI suggests before checking. Only `url` or `title` is needed. */
export interface Candidate { url?: string; kind?: ItemKind; title?: string; creator?: string }
export type Checked = Omit<Item, "area" | "why" | "notice">;

const UA = "Mozilla/5.0 (compatible; LumenLinkCheck/1.0)";
const cache = new Map<string, { at: number; v: Checked | null }>();
const DAY = 864e5;

async function getJson(url: string, ms = 6000): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(ms) });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

/** Fetches a public web page safely: https/http only, no private addresses, at most 3 redirects, 300 KB. */
export async function safeFetchPage(url: string): Promise<{ url: string; html: string } | null> {
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    let u: URL;
    try { u = new URL(current); } catch { return null; }
    if (!/^https?:$/.test(u.protocol) || u.username || u.password || (u.port && !["80", "443"].includes(u.port))) return null;
    try {
      const addrs = await lookup(u.hostname, { all: true });
      if (!addrs.length || addrs.some(a => isPrivateAddress(a.address))) return null;
    } catch { return null; }
    let r: Response;
    try { r = await fetch(u, { redirect: "manual", headers: { "user-agent": UA, accept: "text/html" }, signal: AbortSignal.timeout(7000) }); } catch { return null; }
    if (r.status >= 300 && r.status < 400 && r.headers.get("location")) { current = new URL(r.headers.get("location")!, u).toString(); continue; }
    if (!r.ok || !(r.headers.get("content-type") ?? "").includes("html")) return null;
    const reader = r.body?.getReader();
    if (!reader) return null;
    let html = "", size = 0;
    const dec = new TextDecoder();
    while (size < 300_000) { const { done, value } = await reader.read(); if (done) break; size += value.length; html += dec.decode(value, { stream: true }); }
    reader.cancel().catch(() => {});
    return { url: u.toString(), html };
  }
  return null;
}

const meta = (html: string, prop: string) =>
  html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']`, "i"))?.[1] ??
  html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${prop}["']`, "i"))?.[1];
const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();

async function youtube(c: Candidate, url: string): Promise<Checked | null> {
  const info = classify(url)!, ids = youtubeIds(url);
  const o = await getJson("https://www.youtube.com/oembed?format=json&url=" + encodeURIComponent(info.canonical));
  if (!o) return null;
  const embed = info.kind === "playlist" ? `https://www.youtube-nocookie.com/embed/videoseries?list=${ids.playlist}` : `https://www.youtube-nocookie.com/embed/${ids.video}${ids.playlist && !ids.short ? `?list=${ids.playlist}` : ""}`;
  return { id: itemId(info.canonical), kind: info.kind, url: info.canonical, title: String(o.title), creator: String(o.author_name ?? ""), platform: info.platform, thumb: ids.video ? `https://i.ytimg.com/vi/${ids.video}/mqdefault.jpg` : String(o.thumbnail_url ?? ""), embed };
}

async function oembedSite(c: Candidate, url: string, endpoint: string, platform: string, kind: ItemKind): Promise<Checked | null> {
  const o = await getJson(endpoint + encodeURIComponent(url));
  if (!o) return null;
  const src = String(o.html ?? "").match(/src="([^"]+)"/)?.[1];
  const info = classify(url)!;
  return { id: itemId(info.canonical), kind, url: info.canonical, title: String(o.title || c.title || platform + " post"), creator: String(o.author_name || c.creator || ""), platform, thumb: o.thumbnail_url ? String(o.thumbnail_url) : undefined, embed: src };
}

async function book(c: Candidate, url?: string): Promise<Checked | null> {
  let q = c.title ? `title=${encodeURIComponent(c.title)}` : "";
  if (c.creator) q += `&author=${encodeURIComponent(c.creator)}`;
  if (!q && url?.includes("openlibrary.org/works/")) {
    const w = await getJson(url.replace(/\/$/, "") + ".json");
    if (!w) return null;
    q = `title=${encodeURIComponent(String(w.title))}`;
  }
  if (!q) return null;
  const r = await getJson(`https://openlibrary.org/search.json?${q}&limit=3&fields=key,title,author_name,cover_i,first_publish_year,ebook_access`);
  const d = (r?.docs as Record<string, unknown>[] | undefined)?.[0];
  if (!d) return null;
  const link = url && !url.includes("openlibrary.org") ? url : `https://openlibrary.org${d.key}`;
  return {
    id: itemId(`https://openlibrary.org${d.key}`), kind: "book", url: link, title: String(d.title), creator: ((d.author_name as string[]) ?? [])[0] ?? c.creator ?? "",
    platform: d.ebook_access === "public" ? "Free to read" : "Open Library", thumb: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : undefined,
  };
}

async function podcast(c: Candidate, url?: string): Promise<Checked | null> {
  const ep = url?.match(/[?&]i=(\d+)/)?.[1];
  let r: Record<string, unknown> | undefined;
  if (ep) r = ((await getJson(`https://itunes.apple.com/lookup?id=${ep}&entity=podcastEpisode`))?.results as Record<string, unknown>[] | undefined)?.find(x => String(x.trackId) === ep);
  if (!r && (c.title || c.creator)) {
    const term = encodeURIComponent([c.title, c.creator].filter(Boolean).join(" ").slice(0, 120));
    const list = (await getJson(`https://itunes.apple.com/search?media=podcast&entity=podcastEpisode&limit=8&term=${term}`))?.results as Record<string, unknown>[] | undefined;
    const want = (c.creator ?? "").toLowerCase();
    r = list?.find(x => want && String(x.collectionName).toLowerCase().includes(want)) ?? list?.[0];
  }
  if (!r) return null;
  const link = String(r.trackViewUrl ?? "").split("&uo")[0];
  return {
    id: itemId(link), kind: "podcast", url: link, title: String(r.trackName), creator: String(r.collectionName ?? ""), platform: "Apple Podcasts",
    thumb: String(r.artworkUrl600 ?? r.artworkUrl160 ?? ""), minutes: r.trackTimeMillis ? Math.round(Number(r.trackTimeMillis) / 60000) : undefined,
    embed: typeof r.episodeUrl === "string" ? r.episodeUrl : undefined,
  };
}

async function page(c: Candidate, url: string): Promise<Checked | null> {
  const got = await safeFetchPage(url);
  if (!got) return null;
  const info = classify(got.url)!;
  const title = decode(meta(got.html, "og:title") ?? got.html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? c.title ?? "");
  if (!title) return null;
  const site = meta(got.html, "og:site_name");
  return { id: itemId(info.canonical), kind: c.kind && c.kind !== "video" ? c.kind : info.kind, url: info.canonical, title, creator: decode(meta(got.html, "author") ?? c.creator ?? site ?? ""), platform: site ? decode(site) : info.platform, thumb: meta(got.html, "og:image") };
}

/** Checks one suggestion: is it real, and what is it? Returns null if it can't be confirmed. */
export async function verify(c: Candidate): Promise<Checked | null> {
  const key = (c.url ?? "") + "|" + (c.kind ?? "") + "|" + (c.url ? "" : `${c.title}|${c.creator}`);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < DAY) return hit.v;
  let v: Checked | null = null;
  const info = c.url ? classify(c.url) : null;
  if (c.url && !info) v = null;
  else if (c.kind === "book" && !(info && info.kind === "book" && !info.canonical.includes("openlibrary"))) v = await book(c, c.url);
  else if (c.kind === "podcast" && (!info || info.platform !== "Spotify")) v = await podcast(c, c.url);
  else if (info?.youtubeId || info?.playlistId) v = await youtube(c, c.url!);
  else if (info?.platform === "TikTok") v = await oembedSite(c, c.url!, "https://www.tiktok.com/oembed?url=", "TikTok", "clip");
  else if (info?.platform === "Vimeo") v = await oembedSite(c, c.url!, "https://vimeo.com/api/oembed.json?url=", "Vimeo", "video");
  else if (info?.platform === "TED") v = await oembedSite(c, c.url!, "https://www.ted.com/services/v1/oembed.json?url=", "TED", "video");
  else if (info?.platform === "X") v = await oembedSite(c, c.url!, "https://publish.twitter.com/oembed?omit_script=1&url=", "X", "article");
  else if (c.url) v = await page(c, c.url);
  cache.set(key, { at: Date.now(), v });
  if (cache.size > 5000) cache.delete(cache.keys().next().value!);
  return v;
}
