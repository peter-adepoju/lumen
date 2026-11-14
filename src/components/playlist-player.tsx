"use client";
import { useEffect, useRef, useState } from "react";
import type { Episode, Item, Progress, SavedLink } from "@/lib/model";
import { youtubeIds } from "@/lib/links";
import { CHECK_EVERY, episodeDate, fetchPlaylist, fmtTime, mergeEpisodes, nextEpisode, resumeAt } from "@/lib/playlist";
import { store, useStore } from "@/lib/store/store";
import { loadYouTube, type YTPlayer } from "./player";
import { cn } from "./ui";

function saveProgress(id: string, p: Partial<Progress>) {
  void store.update("progress", cur => ({ ...(cur ?? {}), [id]: { ...(cur?.[id] ?? {}), ...p, at: Date.now() } }));
}

/** Writes a fresh episode list to the saved playlist (if it's saved), noting new episodes. */
export async function refreshSavedPlaylist(s: SavedLink): Promise<{ added: Episode[]; saved: SavedLink } | null> {
  const list = youtubeIds(s.url).playlist;
  if (!list) return null;
  const fresh = await fetchPlaylist(list);
  if (!fresh?.episodes?.length) {
    await store.update("saved", l => (l ?? []).map(x => (x.id === s.id ? { ...x, checkedAt: Date.now() } : x)));
    return null;
  }
  const m = mergeEpisodes(s.episodes, fresh.episodes, s.newIds);
  const latest = m.episodes[m.episodes.length - 1];
  const next: SavedLink = { ...s, episodes: m.episodes, newIds: m.newIds, checkedAt: Date.now(), ...(!s.thumb && latest ? { thumb: `https://i.ytimg.com/vi/${latest.id}/mqdefault.jpg` } : {}), ...(fresh.title && /^(playlist|https?:)/i.test(s.title) ? { title: fresh.title } : {}), ...(!s.creator && fresh.channel ? { creator: fresh.channel } : {}) };
  await store.update("saved", l => (l ?? []).map(x => (x.id === s.id ? next : x)));
  return { added: m.episodes.filter(e => m.added.includes(e.id)), saved: next };
}

/**
 * A YouTube playlist played the way a series should be: oldest episode first (or newest, if you
 * prefer), carrying on from the episode and second you stopped at, on any device. New episodes
 * appear at the end, marked New.
 */
export function PlaylistPlayer({ item }: { item: Item }) {
  const st = useStore();
  const list = youtubeIds(item.url).playlist!;
  const saved = (st.get("saved") ?? []).find(x => x.id === item.id || youtubeIds(x.url).playlist === list);
  const progress = st.get("progress")?.[item.id];
  const [loose, setLoose] = useState<Episode[] | null>(null); // for playlists that aren't saved
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const episodesAsc = saved?.episodes?.length ? saved.episodes : loose ?? [];
  const newestFirst = !!saved?.newestFirst;
  const order = newestFirst ? [...episodesAsc].reverse() : episodesAsc;
  const start = resumeAt(order, progress);
  const [current, setCurrent] = useState<number | null>(null);
  const idx = current ?? start.index;
  const ep = order[idx];
  const watched = new Set(progress?.watched ?? []);
  const fresh = new Set(saved?.newIds ?? []);
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const orderRef = useRef(order);
  const idxRef = useRef(idx);
  // The player's event handlers read the latest order and episode from these.
  useEffect(() => { orderRef.current = order; idxRef.current = idx; });

  // The episode list: from the saved copy, refreshed now and then; or fetched for a playlist that isn't saved.
  useEffect(() => {
    let live = true;
    (async () => {
      if (saved) {
        if (saved.episodes?.length) setState("ready");
        if (!saved.episodes?.length || Date.now() - (saved.checkedAt ?? 0) > CHECK_EVERY) {
          const r = await refreshSavedPlaylist(saved);
          if (live) setState(r || saved.episodes?.length ? "ready" : "failed");
        }
      } else {
        const r = await fetchPlaylist(list);
        if (!live) return;
        if (r?.episodes?.length) { setLoose(r.episodes); setState("ready"); } else setState("failed");
      }
    })();
    return () => { live = false; };
  }, [list, saved?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Opening the playlist counts as having seen its new episodes (they stay marked until you leave).
  useEffect(() => () => { if (saved?.newIds?.length) void store.update("saved", l => (l ?? []).map(x => (x.id === saved.id ? { ...x, newIds: [] } : x))); }, [saved?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // The player: one video at a time, moving on to the next unwatched episode when one ends.
  const ready = state === "ready" && order.length > 0;
  useEffect(() => {
    if (!ready || !host.current) return;
    let gone = false, timer: ReturnType<typeof setInterval> | null = null;
    const first = orderRef.current[idxRef.current];
    loadYouTube().then(YT => {
      if (gone || !host.current) return;
      const el = document.createElement("div"); host.current.appendChild(el);
      const p = new YT.Player(el, {
        host: "https://www.youtube-nocookie.com", width: "100%", height: "100%", videoId: first.id,
        playerVars: { rel: 0, modestbranding: 1, playsinline: 1, start: Math.floor(start.seconds) },
        events: {
          onStateChange: (e: { data: number }) => {
            if (e.data !== 0) return;
            const o = orderRef.current, i = idxRef.current, done = o[i];
            const w = new Set(store.get("progress")?.[item.id]?.watched ?? []); w.add(done.id);
            const n = nextEpisode(o, i, w);
            saveProgress(item.id, { watched: [...w].slice(-2000), video: n !== null ? o[n].id : done.id, index: n ?? i, seconds: 0, done: n === null });
            if (n !== null) { setCurrent(n); p.loadVideoById?.({ videoId: o[n].id }); }
          },
        },
      }) as YTPlayer;
      player.current = p;
      timer = setInterval(() => {
        if (!p.getCurrentTime) return;
        const s = p.getCurrentTime(), d = p.getDuration();
        const o = orderRef.current, i = idxRef.current;
        if (s > 5 && o[i]) saveProgress(item.id, { video: o[i].id, index: i, seconds: Math.floor(s), duration: Math.floor(d) || undefined, done: false });
      }, 8000);
    });
    return () => { gone = true; if (timer) clearInterval(timer); try { player.current?.destroy(); } catch {} player.current = null; };
  }, [ready, item.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const play = (i: number, from = 0) => {
    setCurrent(i);
    saveProgress(item.id, { video: order[i].id, index: i, seconds: from, done: false });
    player.current?.loadVideoById?.({ videoId: order[i].id, startSeconds: from });
  };

  if (state === "failed" && !order.length) {
    // Couldn't read the playlist: fall back to YouTube's own playlist player.
    return <iframe src={`https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(list)}&rel=0&modestbranding=1`} title={item.title} allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen className="aspect-video w-full rounded-[12px] border-0 bg-black" />;
  }
  return (
    <div className="flex flex-col gap-2">
      {ready ? <div ref={host} className="aspect-video w-full overflow-hidden rounded-[12px] bg-black [&>div]:size-full [&_iframe]:size-full" />
        : <div className="grid aspect-video w-full place-items-center rounded-[12px] bg-surface-2 text-[13px] text-muted">Reading the playlist…</div>}
      {ep && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-muted">
          <span>Episode {idx + 1} of {order.length}{progress?.video === ep.id && (progress.seconds ?? 0) > 10 && current === null ? ` · from ${fmtTime(progress.seconds ?? 0)}` : ""} · {watched.size} watched</span>
          <span className="flex items-center gap-3">
            {saved && <button onClick={() => void store.update("saved", l => (l ?? []).map(x => (x.id === saved.id ? { ...x, newestFirst: !newestFirst } : x)))} className="underline underline-offset-4 hover:text-fg">{newestFirst ? "Newest first" : "Oldest first"}</button>}
            <button onClick={() => { saveProgress(item.id, { watched: [], video: order[0].id, index: 0, seconds: 0, done: false }); play(0); }} className="underline underline-offset-4 hover:text-fg">Start over</button>
          </span>
        </div>
      )}
      {order.length > 0 && (
        <ol className="max-h-[300px] overflow-y-auto rounded-[12px] border border-border">
          {order.map((e, i) => (
            <li key={e.id}>
              <button onClick={() => play(i)} className={cn("flex w-full items-center gap-3 border-t border-border px-3 py-2 text-left first:border-t-0 hover:bg-surface-2", i === idx && "bg-surface-2")}>
                <span className="w-6 shrink-0 text-right text-[12px] tabular text-muted">{newestFirst ? order.length - i : i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className={cn("line-clamp-2 text-[13.5px] leading-snug", watched.has(e.id) && i !== idx && "text-muted")}>{e.title}</span>
                  <span className="block text-[11.5px] text-muted">{[episodeDate(e), e.seconds ? fmtTime(e.seconds) : ""].filter(Boolean).join(" · ")}</span>
                </span>
                {fresh.has(e.id) && <span className="shrink-0 rounded-full bg-[var(--gold-soft)] px-2 py-px text-[11px] font-medium">New</span>}
                {i === idx ? <span className="shrink-0 text-[11px] font-medium text-gold">Playing</span> : watched.has(e.id) ? <span aria-label="Watched" className="shrink-0 text-[12px] text-success">✓</span> : null}
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
