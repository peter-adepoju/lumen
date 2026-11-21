"use client";
// What you watch inside Lumen. Every video, short or podcast you play here adds to your own
// "watches" log on your Drive, so Progress can show what you watch most. Nothing leaves your device.

import type { Item, WatchStat } from "./model";
import { store } from "./store/store";

/** One more play of this item: keeps the latest title/thumbnail, adds 1 to the count. */
export function bumpPlay(prev: WatchStat | undefined, item: Item, now = Date.now()): WatchStat {
  return {
    id: item.id, title: item.title, creator: item.creator, platform: item.platform, kind: item.kind,
    area: item.area, url: item.url, thumb: item.thumb,
    plays: (prev?.plays ?? 0) + 1, seconds: prev?.seconds ?? 0, lastAt: now,
  };
}

/** Your most-watched items: most time watched first, then most plays. */
export function topWatched(watches: Record<string, WatchStat> | undefined, n = 8): WatchStat[] {
  return Object.values(watches ?? {})
    .sort((a, b) => b.seconds - a.seconds || b.plays - a.plays || b.lastAt - a.lastAt)
    .slice(0, n);
}

/** Count one play when something starts on Lumen's player. */
export function recordPlay(item: Item) {
  void store.update("watches", cur => ({ ...(cur ?? {}), [item.id]: bumpPlay(cur?.[item.id], item) }));
}

/** Add watched time (whole seconds) to an item as it plays. Does nothing until its first play is recorded. */
export function addWatchSeconds(id: string, secs: number) {
  if (secs <= 0) return;
  void store.update("watches", cur => {
    const prev = cur?.[id];
    if (!prev) return cur ?? {};
    return { ...cur, [id]: { ...prev, seconds: prev.seconds + Math.round(secs), lastAt: Date.now() } };
  });
}
