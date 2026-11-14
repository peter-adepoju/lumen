// Playlists you save: their episodes oldest first, which are new since you last looked,
// and where you are in them.

import type { Episode, Progress, SavedLink } from "./model";
import { youtubeIds } from "./links";

export const CHECK_EVERY = 6 * 3600_000;

export const playlistOf = (s: Pick<SavedLink, "url">) => youtubeIds(s.url).playlist;

/** Takes a fresh episode list. Episodes not seen before are new (except on the very first look). */
export function mergeEpisodes(old: Episode[] | undefined, fresh: Episode[], pendingNew: string[] = []): { episodes: Episode[]; added: string[]; newIds: string[] } {
  if (!old?.length) return { episodes: fresh, added: [], newIds: pendingNew };
  const had = new Set(old.map(e => e.id));
  const added = fresh.filter(e => !had.has(e.id)).map(e => e.id);
  const still = new Set(fresh.map(e => e.id));
  return { episodes: fresh, added, newIds: [...new Set([...pendingNew.filter(id => still.has(id)), ...added])] };
}

/** Where to carry on: the episode you were on (found by its video, so new episodes don't shift you), and the second. */
export function resumeAt(order: Episode[], p: Progress | undefined): { index: number; seconds: number } {
  if (!order.length) return { index: 0, seconds: 0 };
  const i = p?.video ? order.findIndex(e => e.id === p.video) : -1;
  if (i >= 0) return { index: i, seconds: p?.done ? 0 : Math.max(0, (p?.seconds ?? 0) - 3) };
  return { index: Math.min(Math.max(0, p?.index ?? 0), order.length - 1), seconds: 0 };
}

/** The next episode you haven't watched, after the one just finished. */
export function nextEpisode(order: Episode[], current: number, watched: Set<string>): number | null {
  for (let i = current + 1; i < order.length; i++) if (!watched.has(order[i].id)) return i;
  return null;
}

export function episodeDate(e: Episode): string {
  if (!e.date) return "";
  const d = new Date(e.date);
  return (e.approx ? "about " : "") + d.toLocaleDateString("en-GB", e.approx ? { month: "short", year: "numeric" } : { day: "numeric", month: "short", year: "numeric" });
}

export const fmtTime = (s: number) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = Math.floor(s % 60); return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`; };

export async function fetchPlaylist(list: string): Promise<{ title: string; channel: string; episodes: Episode[] } | null> {
  try {
    const r = await fetch(`/api/playlist?list=${encodeURIComponent(list)}`);
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}
