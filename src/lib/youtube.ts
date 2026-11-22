"use client";
// Brings your YouTube subscriptions and liked videos into Lumen, straight from your device to
// Google (like Drive). YouTube does not share watch history with any app, so that can't be read;
// subscriptions and likes are a good signal of what you care about, and feed the interests Lumen notices.

import type { YouTubeState, YtChannel, YtVideo } from "./model";

const API = "https://www.googleapis.com/youtube/v3";

/** A failed YouTube call, carrying the HTTP status so the UI can explain what went wrong. */
export class YouTubeError extends Error {
  constructor(public status: number) { super("youtube-" + status); this.name = "YouTubeError"; }
}

type Thumbs = { default?: { url?: string }; medium?: { url?: string } };
interface SubItem { snippet?: { title?: string; resourceId?: { channelId?: string }; thumbnails?: Thumbs } }
interface VideoItem { id?: string; snippet?: { title?: string; channelTitle?: string; thumbnails?: Thumbs } }
interface ChannelItem { snippet?: { title?: string } }

const bestThumb = (t?: Thumbs) => t?.medium?.url ?? t?.default?.url;

/** Channels you subscribe to, from the API's subscription items. */
export function toChannels(items: SubItem[]): YtChannel[] {
  return items
    .map(s => ({ id: s.snippet?.resourceId?.channelId ?? "", title: (s.snippet?.title ?? "").trim(), thumb: bestThumb(s.snippet?.thumbnails), url: `https://www.youtube.com/channel/${s.snippet?.resourceId?.channelId ?? ""}` }))
    .filter(c => c.id && c.title);
}

/** Videos you liked, from the API's video items. */
export function toVideos(items: VideoItem[]): YtVideo[] {
  return items
    .map(v => ({ id: v.id ?? "", title: (v.snippet?.title ?? "").trim(), channel: (v.snippet?.channelTitle ?? "").trim(), thumb: bestThumb(v.snippet?.thumbnails), url: `https://www.youtube.com/watch?v=${v.id ?? ""}` }))
    .filter(v => v.id && v.title);
}

/** Likes that are new since the last sync, newest-known first, so only these feed the interests log. */
export function newLikes(prev: YouTubeState | undefined, next: YouTubeState): YtVideo[] {
  const had = new Set((prev?.likes ?? []).map(v => v.id));
  return next.likes.filter(v => !had.has(v.id));
}

/** Follows YouTube's paging (50 per call) up to a sensible cap. */
async function allPages<T>(path: string, token: string, max: number): Promise<T[]> {
  const out: T[] = [];
  let page = "";
  do {
    const res = await fetch(`${API}/${path}${page ? `&pageToken=${page}` : ""}`, { headers: { authorization: "Bearer " + token } });
    if (!res.ok) throw new YouTubeError(res.status);
    const j = (await res.json()) as { items?: T[]; nextPageToken?: string };
    if (j.items) out.push(...j.items);
    page = j.nextPageToken ?? "";
  } while (page && out.length < max);
  return out;
}

/** The name of the YouTube account these tokens belong to (its channel title), so the app can show
 * which account is connected. Empty when the account has no channel. */
export async function accountName(token: string): Promise<string | undefined> {
  const items = await allPages<ChannelItem>("channels?part=snippet&mine=true&maxResults=1", token, 1);
  return items[0]?.snippet?.title?.trim() || undefined;
}

/** Fetches the account name, subscriptions and likes, and returns the new YouTube state (keeping the first-connected time). */
export async function syncYouTube(token: string, prev?: YouTubeState, now = Date.now()): Promise<YouTubeState> {
  const account = await accountName(token);
  const subs = toChannels(await allPages<SubItem>("subscriptions?part=snippet&mine=true&maxResults=50&order=alphabetical", token, 500));
  const likes = toVideos(await allPages<VideoItem>("videos?part=snippet&myRating=like&maxResults=50", token, 500));
  return { connectedAt: prev?.connectedAt ?? now, syncedAt: now, account, subs, likes };
}
