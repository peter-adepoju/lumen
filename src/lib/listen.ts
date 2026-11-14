"use client";
// "Listen instead": plays a saved video (or a playlist's episodes) as the creator's own podcast
// episodes, which keep playing with the screen off.

import type { Item, SavedLink } from "./model";
import { youtubeIds } from "./links";
import { store } from "./store/store";

const WEEK = 7 * 86400_000;
type Match = NonNullable<SavedLink["podcast"]>["matches"][string];

/** The videos to look for: a playlist's episodes in watching order, or the one video. */
function videosOf(s: SavedLink): { key: string; title: string }[] {
  if (youtubeIds(s.url).playlist && s.episodes?.length) {
    const order = s.newestFirst ? [...s.episodes].reverse() : s.episodes;
    return order.map(e => ({ key: e.id, title: e.title }));
  }
  return [{ key: "video", title: s.title }];
}

/** Looks for the podcast version (remembered for a week; looked for again when there are new episodes). */
export async function findPodcast(s: SavedLink, force = false): Promise<SavedLink["podcast"] | null> {
  const want = videosOf(s);
  const p = s.podcast;
  const missing = want.filter(v => !p?.matches[v.key]);
  if (p && !force && Date.now() - p.checkedAt < WEEK && (!missing.length || missing.every(m => !s.newIds?.includes(m.key)))) return p;
  let r: Response;
  try {
    r = await fetch("/api/listen", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ creator: s.creator ?? "", feed: p?.feed, videos: want }) });
  } catch { return p ?? null; }
  if (!r.ok) return p ?? null;
  const j = (await r.json()) as { show: { title: string; feed: string; artwork?: string } | null; matches: Record<string, Match> };
  const podcast = { feed: j.show?.feed, title: j.show?.title, artwork: j.show?.artwork, checkedAt: Date.now(), matches: { ...(p?.matches ?? {}), ...j.matches } };
  await store.update("saved", l => (l ?? []).map(x => (x.id === s.id ? { ...x, podcast } : x)));
  return podcast;
}

/**
 * What to play: the episode for where you are (the playlist's current video, or the video itself),
 * then the following ones that also have audio. Starts at the same point as the video, roughly.
 */
export async function listenQueue(s: SavedLink, podcast: NonNullable<SavedLink["podcast"]>): Promise<Item | null> {
  const vids = videosOf(s);
  const prog = store.get("progress")?.[s.id];
  const at = youtubeIds(s.url).playlist ? Math.max(0, vids.findIndex(v => v.key === prog?.video)) : 0;
  const make = (v: { key: string; title: string }): Item | null => {
    const m = podcast.matches[v.key];
    if (!m) return null;
    return { id: `listen:${s.id}:${v.key}`, kind: "podcast", url: m.audio, embed: m.audio, title: m.title, creator: s.creator ?? podcast.title ?? "", platform: "Podcast", thumb: podcast.artwork ?? s.thumb, area: "saved", minutes: m.seconds ? Math.round(m.seconds / 60) : undefined, ref: { saved: s.id, video: v.key } };
  };
  const items = vids.slice(at).map(make).filter((x): x is Item => !!x);
  if (!items.length) return null;
  const [first, ...rest] = items;
  // Carry on from where the video stopped, unless you'd already listened further.
  const listened = store.get("progress")?.[first.id];
  const videoSeconds = first.ref?.video === "video" ? prog?.seconds : prog?.video === first.ref?.video ? prog?.seconds : 0;
  if (!listened && videoSeconds && videoSeconds > 30 && !prog?.done) {
    await store.update("progress", cur => ({ ...(cur ?? {}), [first.id]: { seconds: videoSeconds, at: Date.now() } }));
  }
  return { ...first, next: rest.slice(0, 60) };
}
