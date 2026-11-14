"use client";
import { useEffect, useRef, useSyncExternalStore } from "react";
import type { Episode, Item, Progress, SavedLink } from "@/lib/model";
import { youtubeIds } from "@/lib/links";
import { CHECK_EVERY, episodeDate, fetchPlaylist, fmtTime, mergeEpisodes, nextEpisode, resumeAt } from "@/lib/playlist";
import { store, useStore } from "@/lib/store/store";
import { jumpTo, playOnStage, setCommands, setPlaying, useStage } from "@/lib/stage";
import { loadYouTube, type YTPlayer } from "./player";
import { cn } from "./ui";

export function saveProgress(id: string, p: Partial<Progress>) {
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

// Episodes of playlists that aren't saved, shared by the page's list and the player.
const loose = new Map<string, Episode[] | "failed" | "loading">();
const looseSubs = new Set<() => void>();
function loadLoose(list: string) {
  if (loose.has(list)) return;
  loose.set(list, "loading");
  void fetchPlaylist(list).then(r => { loose.set(list, r?.episodes?.length ? r.episodes : "failed"); looseSubs.forEach(f => f()); });
}

/** A playlist's episodes in watching order, and whether they're ready. */
export function usePlaylistOrder(item: Item) {
  const st = useStore();
  const list = youtubeIds(item.url).playlist!;
  const saved = (st.get("saved") ?? []).find(x => x.id === item.id || youtubeIds(x.url).playlist === list);
  const l = useSyncExternalStore(cb => { looseSubs.add(cb); return () => looseSubs.delete(cb); }, () => loose.get(list), () => undefined);
  useEffect(() => { if (!saved?.episodes?.length) loadLoose(list); }, [list, saved?.episodes?.length]);
  const asc = saved?.episodes?.length ? saved.episodes : Array.isArray(l) ? l : [];
  const newestFirst = !!saved?.newestFirst;
  const order = newestFirst ? [...asc].reverse() : asc;
  const state: "loading" | "ready" | "failed" = order.length ? "ready" : l === "failed" ? "failed" : "loading";
  return { list, saved, order, newestFirst, state };
}

/**
 * The playlist engine (lives in the app's one player): plays the episodes in order from where you
 * stopped, moves on to the next unwatched one, and remembers your place.
 */
export function PlaylistEngine({ item, host }: { item: Item; host: HTMLDivElement | null }) {
  const { order, state, list } = usePlaylistOrder(item);
  const orderRef = useRef(order);
  useEffect(() => { orderRef.current = order; });
  const ready = state === "ready";
  useEffect(() => {
    if (!ready || !host) return;
    let gone = false, timer: ReturnType<typeof setInterval> | null = null, p: YTPlayer | null = null;
    const o0 = orderRef.current;
    const start = resumeAt(o0, store.get("progress")?.[item.id]);
    let current = o0[start.index].id;
    const idx = () => Math.max(0, orderRef.current.findIndex(e => e.id === current));
    loadYouTube().then(YT => {
      if (gone) return;
      const el = document.createElement("div"); host.appendChild(el);
      p = new YT.Player(el, {
        host: "https://www.youtube-nocookie.com", width: "100%", height: "100%", videoId: current,
        playerVars: { rel: 0, modestbranding: 1, playsinline: 1, autoplay: 1, start: Math.floor(start.seconds) },
        events: {
          onStateChange: (e: { data: number }) => {
            if (e.data === 1) setPlaying(true);
            if (e.data === 2) setPlaying(false);
            if (e.data !== 0) return;
            const o = orderRef.current, i = idx(), done = o[i];
            const w = new Set(store.get("progress")?.[item.id]?.watched ?? []); w.add(done.id);
            const n = nextEpisode(o, i, w);
            saveProgress(item.id, { watched: [...w].slice(-2000), video: n !== null ? o[n].id : done.id, index: n ?? i, seconds: 0, done: n === null });
            if (n !== null) { current = o[n].id; p?.loadVideoById?.({ videoId: current }); } else setPlaying(false);
          },
        },
      }) as YTPlayer;
      setCommands({
        play: () => p?.playVideo?.(), pause: () => (p as unknown as { pauseVideo?: () => void })?.pauseVideo?.(),
        jump: (id, seconds = 0) => { current = id; saveProgress(item.id, { video: id, index: idx(), seconds, done: false }); p?.loadVideoById?.({ videoId: id, startSeconds: seconds }); },
      });
      timer = setInterval(() => {
        if (!p?.getCurrentTime) return;
        const s = p.getCurrentTime(), d = p.getDuration();
        if (s > 5) saveProgress(item.id, { video: current, index: idx(), seconds: Math.floor(s), duration: Math.floor(d) || undefined, done: false });
      }, 8000);
    });
    return () => { gone = true; if (timer) clearInterval(timer); try { p?.destroy(); } catch {} setCommands({}); };
  }, [ready, item.id, host]);
  if (state === "failed" && host) {
    // Couldn't read the playlist: YouTube's own playlist player.
    return <iframe src={`https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(list)}&rel=0&modestbranding=1&autoplay=1`} title={item.title} allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen className="size-full border-0" />;
  }
  if (state === "loading") return <div className="grid size-full place-items-center text-[13px] text-white/70">Reading the playlist…</div>;
  return null;
}

/** On the page, under a playlist: where you are, and every episode to jump to. */
export function PlaylistPanel({ item }: { item: Item }) {
  const st = useStore();
  const stg = useStage();
  const { saved, order, newestFirst } = usePlaylistOrder(item);
  const progress = st.get("progress")?.[item.id];
  const active = stg.item?.id === item.id;
  const idx = resumeAt(order, progress).index;
  const ep = order[idx];
  const watched = new Set(progress?.watched ?? []);
  const fresh = new Set(saved?.newIds ?? []);

  // Saved playlists: get the newest episode list when it's been a while.
  useEffect(() => {
    if (saved && (!saved.episodes?.length || Date.now() - (saved.checkedAt ?? 0) > CHECK_EVERY)) void refreshSavedPlaylist(saved);
  }, [saved?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Opening the playlist counts as having seen its new episodes (they stay marked until you leave).
  useEffect(() => () => { if (saved?.newIds?.length) void store.update("saved", l => (l ?? []).map(x => (x.id === saved.id ? { ...x, newIds: [] } : x))); }, [saved?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const play = (i: number) => {
    saveProgress(item.id, { video: order[i].id, index: i, seconds: 0, done: false });
    if (active) jumpTo(order[i].id, 0); else playOnStage(item, location.pathname + location.search);
  };
  if (!order.length) return null;
  return (
    <div className="flex flex-col gap-2">
      {ep && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-muted">
          <span>Episode {idx + 1} of {order.length}{progress?.video === ep.id && (progress.seconds ?? 0) > 10 ? ` · at ${fmtTime(progress.seconds ?? 0)}` : ""} · {watched.size} watched</span>
          <span className="flex items-center gap-3">
            {saved && <button onClick={() => void store.update("saved", l => (l ?? []).map(x => (x.id === saved.id ? { ...x, newestFirst: !newestFirst } : x)))} className="underline underline-offset-4 hover:text-fg">{newestFirst ? "Newest first" : "Oldest first"}</button>}
            <button onClick={() => { saveProgress(item.id, { watched: [], video: order[0].id, index: 0, seconds: 0, done: false }); if (active) jumpTo(order[0].id, 0); }} className="underline underline-offset-4 hover:text-fg">Start over</button>
          </span>
        </div>
      )}
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
              {i === idx ? <span className="shrink-0 text-[11px] font-medium text-gold">{active ? "Playing" : "Up next"}</span> : watched.has(e.id) ? <span aria-label="Watched" className="shrink-0 text-[12px] text-success">✓</span> : null}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
