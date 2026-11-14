"use client";
import Link from "next/link";
import { useEffect } from "react";
import { CHECK_EVERY, playlistOf } from "@/lib/playlist";
import { store, useStore } from "@/lib/store/store";
import { refreshSavedPlaylist } from "./playlist-player";
import { Card } from "./ui";

async function notify(title: string, body: string, url: string) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const opts = { body, icon: "/icon-192.png", badge: "/icon-192.png", tag: "lumen-episodes-" + url, data: { url } };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, opts); else new Notification(title, opts);
  } catch {}
}

let running = false;
/** Checks your saved playlists for new episodes (at most every six hours each), and tells you about any. */
export async function checkPlaylists() {
  if (running || !navigator.onLine) return;
  running = true;
  try {
    const due = (store.get("saved") ?? []).filter(s => playlistOf(s) && Date.now() - (s.checkedAt ?? 0) > CHECK_EVERY).slice(0, 8);
    for (const s of due) {
      const r = await refreshSavedPlaylist(s).catch(() => null);
      if (r?.added.length) {
        const n = r.added.length;
        await notify(n === 1 ? `New episode: ${r.added[0].title}` : `${n} new episodes`, r.saved.title, `/saved?open=${encodeURIComponent(s.id)}`);
      }
    }
  } finally { running = false; }
}

/** Runs the check when Lumen opens and every hour while it stays open. */
export function usePlaylistWatch() {
  useEffect(() => {
    const go = () => { if (document.visibilityState === "visible") void checkPlaylists(); };
    const first = setTimeout(go, 4000);
    const every = setInterval(go, 3600_000);
    document.addEventListener("visibilitychange", go);
    return () => { clearTimeout(first); clearInterval(every); document.removeEventListener("visibilitychange", go); };
  }, []);
}

/** On Today: saved playlists with episodes you haven't seen yet. */
export function NewEpisodes() {
  const st = useStore();
  const withNew = (st.get("saved") ?? []).filter(s => s.newIds?.length);
  if (!withNew.length) return null;
  return (
    <Card className="flex flex-col gap-2">
      <span className="eyebrow">New episodes</span>
      {withNew.map(s => {
        const latest = s.episodes?.find(e => e.id === s.newIds![s.newIds!.length - 1]);
        return (
          <Link key={s.id} href={`/saved?open=${encodeURIComponent(s.id)}`} className="flex items-center gap-3 border-t border-border pt-2 first:border-t-0 first:pt-0 hover:underline hover:underline-offset-4">
            {s.thumb && <img src={s.thumb} alt="" className="h-[45px] w-[80px] shrink-0 rounded-[8px] object-cover" />}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{s.title}</span>
              <span className="block truncate text-[12.5px] text-muted">{s.newIds!.length === 1 ? `New: ${latest?.title ?? "1 episode"}` : `${s.newIds!.length} new episodes`}</span>
            </span>
          </Link>
        );
      })}
    </Card>
  );
}
