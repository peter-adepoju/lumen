// Recognising links: which platform, which kind of content, and a stable id.
// Pure functions, shared by the device and the link checker on the server.
import type { ItemKind } from "./model";

export interface LinkInfo { platform: string; kind: ItemKind; youtubeId?: string; playlistId?: string; canonical: string }

const host = (u: URL) => u.hostname.replace(/^www\.|^m\./, "").toLowerCase();

export function youtubeIds(url: string): { video?: string; playlist?: string; short?: boolean } {
  let u: URL;
  try { u = new URL(url); } catch { return {}; }
  const h = host(u);
  const id = (s: string | null | undefined) => (s && /^[\w-]{11}$/.test(s) ? s : undefined);
  const list = u.searchParams.get("list");
  const playlist = list && /^[\w-]{10,}$/.test(list) && !list.startsWith("RD") ? list : undefined; // RD… are automatic mixes
  if (h === "youtu.be") return { video: id(u.pathname.slice(1)), playlist };
  if (h === "youtube.com" || h === "music.youtube.com" || h === "youtube-nocookie.com") {
    const shorts = u.pathname.match(/^\/shorts\/([\w-]{11})/);
    if (shorts) return { video: shorts[1], short: true };
    const embed = u.pathname.match(/^\/embed\/([\w-]{11})/);
    if (embed) return { video: embed[1], playlist };
    return { video: id(u.searchParams.get("v")), playlist };
  }
  return {};
}

export function classify(url: string): LinkInfo | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const h = host(u);
  const yt = youtubeIds(url);
  if (yt.short && yt.video) return { platform: "YouTube Shorts", kind: "clip", youtubeId: yt.video, canonical: `https://www.youtube.com/shorts/${yt.video}` };
  if (yt.video) return { platform: "YouTube", kind: "video", youtubeId: yt.video, playlistId: yt.playlist, canonical: `https://www.youtube.com/watch?v=${yt.video}` };
  if (yt.playlist) return { platform: "YouTube", kind: "playlist", playlistId: yt.playlist, canonical: `https://www.youtube.com/playlist?list=${yt.playlist}` };
  const plain = u.origin.replace("http:", "https:") + u.pathname.replace(/\/$/, "");
  if (h.endsWith("tiktok.com")) return { platform: "TikTok", kind: "clip", canonical: plain };
  if (h === "instagram.com" && /^\/(reel|p)\//.test(u.pathname)) return { platform: "Instagram", kind: "clip", canonical: plain };
  if (h === "x.com" || h === "twitter.com") return { platform: "X", kind: "article", canonical: plain.replace("twitter.com", "x.com") };
  if (h === "podcasts.apple.com") return { platform: "Apple Podcasts", kind: "podcast", canonical: u.searchParams.get("i") ? `${plain}?i=${u.searchParams.get("i")}` : plain };
  if (h === "open.spotify.com" && /^\/(episode|show)\//.test(u.pathname)) return { platform: "Spotify", kind: "podcast", canonical: plain };
  if (h === "openlibrary.org" || h === "gutenberg.org" || h === "standardebooks.org" || h === "books.google.com") return { platform: siteName(h), kind: "book", canonical: plain };
  if (h === "ted.com" && u.pathname.startsWith("/talks/")) return { platform: "TED", kind: "video", canonical: plain };
  if (h === "vimeo.com" && /^\/\d+/.test(u.pathname)) return { platform: "Vimeo", kind: "video", canonical: plain };
  if (["coursera.org", "edx.org", "khanacademy.org", "ocw.mit.edu"].includes(h)) return { platform: siteName(h), kind: "course", canonical: plain };
  return { platform: siteName(h), kind: "article", canonical: u.toString().replace(/#.*$/, "") };
}

export function siteName(h: string): string {
  const known: Record<string, string> = {
    "gutenberg.org": "Project Gutenberg", "standardebooks.org": "Standard Ebooks", "openlibrary.org": "Open Library", "books.google.com": "Google Books",
    "coursera.org": "Coursera", "edx.org": "edX", "khanacademy.org": "Khan Academy", "ocw.mit.edu": "MIT OpenCourseWare", "medium.com": "Medium",
    "substack.com": "Substack", "reddit.com": "Reddit", "linkedin.com": "LinkedIn", "facebook.com": "Facebook", "ted.com": "TED", "wikipedia.org": "Wikipedia",
  };
  const bare = h.replace(/^www\./, "");
  for (const [k, v] of Object.entries(known)) if (bare === k || bare.endsWith("." + k)) return v;
  const parts = bare.split(".");
  return parts.length > 1 ? parts[parts.length - 2].replace(/^\w/, c => c.toUpperCase()) : bare;
}

/** A short stable id for an item, from its canonical link. */
export function itemId(canonical: string): string {
  let h = 2166136261;
  for (let i = 0; i < canonical.length; i++) { h ^= canonical.charCodeAt(i); h = Math.imul(h, 16777619); }
  return "i" + (h >>> 0).toString(36);
}

/** Refuses addresses that point inside a private network, so the link checker can't be used to probe one. */
export function isPrivateAddress(ip: string): boolean {
  if (ip === "::1" || ip === "::" || /^fe80:/i.test(ip) || /^f[cd][0-9a-f]{2}:/i.test(ip)) return true;
  const v4 = ip.replace(/^::ffff:/i, "");
  const m = v4.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const [a, b] = [+m[1], +m[2]];
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}
