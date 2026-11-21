"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Item, Progress } from "@/lib/model";
import { youtubeIds } from "@/lib/links";
import { store } from "@/lib/store/store";
import { closeStage, playOnStage, setCommands, setFull, setPlaying, setSlot, stage, stageCommands, useStage } from "@/lib/stage";
import { PlaylistEngine, PlaylistPanel } from "./playlist-player";
import { cn } from "./ui";

/* Minimal typing for the YouTube IFrame API. */
export interface YTPlayer { getCurrentTime(): number; getDuration(): number; getPlaylistIndex(): number; destroy(): void; loadVideoById?(o: { videoId: string; startSeconds?: number }): void; cueVideoById?(o: { videoId: string; startSeconds?: number }): void; playVideo?(): void; pauseVideo?(): void }
interface YTNamespace { Player: new (el: HTMLElement, opts: Record<string, unknown>) => YTPlayer }
declare global { interface Window { YT?: YTNamespace; onYouTubeIframeAPIReady?: () => void } }

let ytReady: Promise<YTNamespace> | null = null;
export function loadYouTube(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!ytReady) {
    ytReady = new Promise(resolve => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(window.YT!); };
      const s = document.createElement("script"); s.src = "https://www.youtube.com/iframe_api"; s.async = true; document.head.appendChild(s);
    });
  }
  return ytReady;
}

function saveProgress(id: string, p: Omit<Progress, "at">) {
  store.update("progress", cur => ({ ...(cur ?? {}), [id]: { ...(cur?.[id] ?? {}), ...p, at: Date.now() } }));
}

type Kind = "youtube" | "playlist" | "embed" | "audio" | null;
const EMBED = /^https:\/\/(www\.tiktok\.com\/player|player\.vimeo\.com|embed\.ted\.com)/;
function kindOf(item: Item): Kind {
  const yt = youtubeIds(item.url);
  if (yt.playlist) return "playlist";
  if (yt.video) return "youtube";
  if (item.kind === "podcast" && item.embed && (/\.(mp3|m4a|aac)(\?|$)/i.test(item.embed) || item.ref)) return "audio";
  if (item.embed && EMBED.test(item.embed)) return "embed";
  return null;
}

/**
 * A video or podcast on a page. Shows its picture with a play button; once playing, the app's one
 * player sits here, and moves to a mini-player in the corner if you leave the page or scroll away.
 */
export function Player({ item }: { item: Item }) {
  const kind = kindOf(item);
  const stg = useStage();
  const path = usePathname();
  const active = stg.item?.id === item.id;
  const tall = item.kind === "clip" && kind === "embed";
  const slot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!active) return;
    setSlot(slot.current, item.id);
    return () => setSlot(null, item.id);
  }, [active, item.id]);
  if (!kind) return null;
  const start = () => playOnStage(item, path + (typeof location !== "undefined" ? location.search : ""));
  const saved = store.get("progress")?.[item.id];
  return (
    <div className="flex flex-col gap-2">
      {kind === "audio" ? (
        active ? <div ref={slot} className="h-[56px] w-full" />
          : <button onClick={start} className="flex items-center gap-3 rounded-[12px] border border-border p-3 text-left hover:bg-surface-2">
              {item.thumb && <img src={item.thumb} alt="" className="size-14 rounded-[10px] object-cover" />}
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-fg text-bg"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M8 5v14l11-7z" /></svg></span>
              <span className="text-[13.5px]">{saved && !saved.done && (saved.seconds ?? 0) > 10 ? "Carry on listening" : "Play episode"}</span>
            </button>
      ) : active ? (
        <div ref={slot} className={tall ? "mx-auto aspect-[9/16] w-full max-w-[340px]" : "aspect-video w-full"} />
      ) : (
        <button onClick={start} aria-label={`Play ${item.title}`}
          className={cn("group relative block w-full overflow-hidden rounded-[12px] border border-border bg-black", tall ? "mx-auto aspect-[9/16] max-w-[340px]" : "aspect-video")}>
          {item.thumb && <img src={item.thumb} alt="" loading="lazy" className="h-full w-full object-cover opacity-90" onError={e => { e.currentTarget.style.visibility = "hidden"; }} />}
          <span className="absolute inset-0 grid place-items-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-black/65 px-4 py-2 text-[13.5px] font-medium text-white transition-transform group-hover:scale-105">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M8 5v14l11-7z" /></svg>
              {saved && !saved.done && ((saved.seconds ?? 0) > 10 || saved.video) ? "Carry on" : "Play"}
            </span>
          </span>
        </button>
      )}
      {active && kind !== "audio" && <StageButtons />}
      {kind === "playlist" && <PlaylistPanel item={item} />}
    </div>
  );
}

/** Under the playing video on its page: full screen. */
function StageButtons() {
  return (
    <div className="flex justify-end gap-4 text-[12.5px] text-muted">
      <button onClick={() => void goFullScreen()} className="inline-flex items-center gap-1.5 hover:text-fg">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
        Full screen
      </button>
      <button onClick={closeStage} className="hover:text-fg">Stop</button>
    </div>
  );
}

// ── Full screen and turning sideways ─────────────────────────────────────
type Lockable = ScreenOrientation & { lock?: (o: "landscape") => Promise<void>; unlock?: () => void };
const orientation = () => (typeof screen !== "undefined" ? (screen.orientation as Lockable | undefined) : undefined);
const lockLandscape = () => { try { void orientation()?.lock?.("landscape")?.catch(() => {}); } catch {} };
const unlock = () => { try { orientation()?.unlock?.(); } catch {} };
let stageEl: HTMLDivElement | null = null;
let pseudoFull: ((v: boolean) => void) | null = null;
async function goFullScreen() {
  const el = stageEl as (HTMLDivElement & { webkitRequestFullscreen?: () => void }) | null;
  if (!el) return;
  if (el.requestFullscreen) { try { await el.requestFullscreen({ navigationUI: "hide" }); lockLandscape(); return; } catch {} }
  if (el.webkitRequestFullscreen) { el.webkitRequestFullscreen(); return; }
  pseudoFull?.(true);
}

const LANDSCAPE_PHONE = "(orientation: landscape) and (max-height: 560px)";
function useMedia(q: string) {
  return useSyncExternalStore(cb => { const m = matchMedia(q); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); }, () => matchMedia(q).matches, () => false);
}

/**
 * How far the browser's own top and bottom bars reach into the page right now. A fixed element
 * sits in the layout viewport, so on a phone the address/tool bar can hide a corner-pinned
 * mini-player below the screen; add these insets to keep it fully in view. Zero in an installed app.
 */
function useViewportInsets(): { top: number; bottom: number } {
  const sub = (cb: () => void) => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return () => {};
    vv.addEventListener("resize", cb); vv.addEventListener("scroll", cb);
    return () => { vv.removeEventListener("resize", cb); vv.removeEventListener("scroll", cb); };
  };
  const read = (): { top: number; bottom: number } => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return ZERO_INSETS;
    const top = Math.round(vv.offsetTop);
    const bottom = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    return top === 0 && bottom === 0 ? ZERO_INSETS : { top, bottom };
  };
  return useSyncExternalStore(sub, read, () => ZERO_INSETS);
}
const ZERO_INSETS = { top: 0, bottom: 0 }; // one stable object, so the store sees "no change"

// ── The engines ───────────────────────────────────────────────────────────
function YouTubeEngine({ item, host }: { item: Item; host: HTMLDivElement | null }) {
  useEffect(() => {
    if (!host) return;
    const yt = youtubeIds(item.url);
    let player: YTPlayer | null = null, timer: ReturnType<typeof setInterval> | null = null, gone = false;
    const saved = store.get("progress")?.[item.id];
    const start = saved && !saved.done && (saved.seconds ?? 0) > 10 ? Math.floor((saved.seconds ?? 0) - 3) : 0;
    loadYouTube().then(YT => {
      if (gone) return;
      const el = document.createElement("div"); host.appendChild(el);
      player = new YT.Player(el, {
        host: "https://www.youtube-nocookie.com", width: "100%", height: "100%", videoId: yt.video,
        playerVars: { rel: 0, modestbranding: 1, playsinline: 1, autoplay: 1, start },
        events: {
          onReady: () => player?.playVideo?.(), // start playing even when it opens straight into the mini-player
          onStateChange: (e: { data: number }) => {
            if (e.data === 1) setPlaying(true);
            if (e.data === 2) setPlaying(false);
            if (e.data === 0 && player) { setPlaying(false); const d = player.getDuration(); saveProgress(item.id, { seconds: d, duration: d, done: true }); }
          },
        },
      });
      setCommands({ play: () => player?.playVideo?.(), pause: () => player?.pauseVideo?.() });
      timer = setInterval(() => {
        if (!player?.getCurrentTime) return;
        const s = player.getCurrentTime(), d = player.getDuration();
        if (s > 5) saveProgress(item.id, { seconds: Math.floor(s), duration: Math.floor(d) || undefined });
      }, 8000);
    });
    return () => { gone = true; if (timer) clearInterval(timer); try { player?.destroy(); } catch {} setCommands({}); };
  }, [item.id, item.url, host]);
  return null;
}

function AudioEngine({ item }: { item: Item }) {
  const a = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const el = a.current;
    if (!el) return;
    const saved = store.get("progress")?.[item.id];
    const onMeta = () => { if (saved && !saved.done && (saved.seconds ?? 0) > 10) el.currentTime = (saved.seconds ?? 0) - 3; void el.play().catch(() => {}); };
    const onTime = () => { if (Math.floor(el.currentTime) % 10 === 0 && el.currentTime > 5) saveProgress(item.id, { seconds: Math.floor(el.currentTime), duration: Math.floor(el.duration) || undefined }); };
    const onEnd = () => {
      setPlaying(false);
      saveProgress(item.id, { seconds: Math.floor(el.duration), duration: Math.floor(el.duration), done: true });
      // Listening to a saved video or playlist: it counts as watched there, and the next episode follows.
      if (item.ref?.video) {
        const ref = item.ref;
        void store.update("progress", cur => {
          const p = cur?.[ref.saved] ?? { at: 0 };
          const watched = [...new Set([...(p.watched ?? []), ref.video!])].slice(-2000);
          return { ...(cur ?? {}), [ref.saved]: { ...p, watched, ...(ref.video === "video" ? { done: true } : { video: item.next?.[0]?.ref?.video ?? ref.video, seconds: 0 }), at: Date.now() } };
        });
      }
      if (item.next?.length) { const [n, ...rest] = item.next; playOnStage({ ...n, next: rest }, stage().home); }
    };
    const onPlay = () => setPlaying(true), onPause = () => setPlaying(false);
    el.addEventListener("loadedmetadata", onMeta); el.addEventListener("timeupdate", onTime); el.addEventListener("ended", onEnd); el.addEventListener("play", onPlay); el.addEventListener("pause", onPause);
    setCommands({ play: () => void el.play(), pause: () => el.pause() });
    // Lock screen and headphone controls, where the phone offers them.
    try {
      if ("mediaSession" in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({ title: item.title, artist: item.creator, artwork: item.thumb ? [{ src: item.thumb }] : [] });
        navigator.mediaSession.setActionHandler("nexttrack", item.next?.length ? () => { const [n, ...rest] = item.next!; playOnStage({ ...n, next: rest }, stage().home); } : null);
        navigator.mediaSession.setActionHandler("seekbackward", () => { el.currentTime = Math.max(0, el.currentTime - 15); });
        navigator.mediaSession.setActionHandler("seekforward", () => { el.currentTime = Math.min(el.duration || Infinity, el.currentTime + 30); });
      }
    } catch {}
    return () => { el.removeEventListener("loadedmetadata", onMeta); el.removeEventListener("timeupdate", onTime); el.removeEventListener("ended", onEnd); el.removeEventListener("play", onPlay); el.removeEventListener("pause", onPause); setCommands({}); };
  }, [item.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return <audio ref={a} controls preload="metadata" src={item.embed} className="h-[44px] w-full">Your browser can&apos;t play this episode.</audio>;
}

// ── The one player ────────────────────────────────────────────────────────
type Rect = { top: number; left: number; width: number; height: number };

/** Mounted once in the app layout. Plays whatever is on stage, over its page spot or in the corner. */
export function Stage() {
  const stg = useStage();
  const router = useRouter();
  const item = stg.item;
  const kind = item ? kindOf(item) : null;
  const box = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [pseudoFor, setPseudoFor] = useState<string | null>(null); // window-filling "full screen" where the browser has none
  const pseudo = !!item && pseudoFor === item.id;
  const landscape = useMedia(LANDSCAPE_PHONE);
  const wide = useMedia("(min-width: 1024px)");
  const insets = useViewportInsets();
  const path = usePathname();
  // Pages with Lumen's tab bar at the bottom (not the reader, setup or the public pages).
  const tabBar = !/^\/(read|setup|about|privacy|terms)(\/|$)/.test(path) && path !== "/";
  const [corner, setCorner] = useState<"br" | "bl" | "tr" | "tl">(() => { try { return (localStorage.getItem("lumen:mini-corner") as "br") || "br"; } catch { return "br"; } });
  const [drag, setDrag] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null);
  const dragging = useRef<{ dx: number; dy: number } | null>(null);
  const dragStart = (e: React.PointerEvent) => {
    const b = box.current?.getBoundingClientRect();
    if (!b) return;
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
    dragging.current = { dx: e.clientX - b.left, dy: e.clientY - b.top };
    setDrag({ x: b.left, y: b.top, dx: dragging.current.dx, dy: dragging.current.dy });
  };
  const dragMove = (e: React.PointerEvent) => { const d = dragging.current; if (d) setDrag({ x: e.clientX - d.dx, y: e.clientY - d.dy, ...d }); };
  const dragEnd = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = null;
    const c = `${e.clientY < innerHeight / 2 ? "t" : "b"}${e.clientX < innerWidth / 2 ? "l" : "r"}` as "br";
    setCorner(c); setDrag(null);
    try { localStorage.setItem("lumen:mini-corner", c); } catch {}
  };

  useEffect(() => { stageEl = box.current; pseudoFull = v => setPseudoFor(v ? (item?.id ?? null) : null); }, [item]);
  useEffect(() => {
    const on = () => {
      const f = !!document.fullscreenElement && (document.fullscreenElement === box.current || !!box.current?.contains(document.fullscreenElement));
      setFull(f);
      if (f) lockLandscape(); else unlock();
    };
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);

  // Follow the page's spot for the video as the page scrolls and changes.
  useEffect(() => {
    if (!item) return;
    let raf = 0, last = "";
    const loop = () => {
      const el = stg.slot;
      let r: Rect | null = null;
      if (el && el.isConnected) {
        const b = el.getBoundingClientRect();
        const visible = Math.min(b.bottom, innerHeight) - Math.max(b.top, 0);
        if (b.width > 0 && visible > b.height * 0.4) r = { top: b.top, left: b.left, width: b.width, height: b.height };
      }
      const k = r ? `${Math.round(r.top)},${Math.round(r.left)},${Math.round(r.width)},${Math.round(r.height)}` : "mini";
      if (k !== last) { last = k; setRect(r); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [item, stg.slot]);

  const fill = !!item && kind !== "audio" && !stg.full && (pseudo || (stg.playing && landscape));
  useEffect(() => {
    if (!fill) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [fill]);

  if (!item || !kind) return null;
  const mini = !rect && !fill && !stg.full;
  const tall = item.kind === "clip" && kind === "embed";
  const miniW = kind === "audio" ? Math.min(360, (typeof innerWidth !== "undefined" ? innerWidth : 360) - 32) : wide ? 320 : 220;
  // The mini-player sits in a corner you choose (drag it), clear of the tab bar where there is one.
  const low = `calc(${tabBar && !wide ? 78 : 16}px + env(safe-area-inset-bottom) + ${insets.bottom}px)`;
  const high = `calc(16px + env(safe-area-inset-top) + ${insets.top}px)`;
  const at = drag ? { left: drag.x, top: drag.y } : { [corner.includes("r") ? "right" : "left"]: 16, [corner.includes("b") ? "bottom" : "top"]: corner.includes("b") ? low : high };
  const style: React.CSSProperties = stg.full ? {} : fill ? { inset: 0 } : rect ? { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
    : { ...at, width: miniW };

  return (
    <div ref={box} style={style} data-video-frame=""
      className={cn("z-[70] overflow-hidden", stg.full ? "grid place-items-center bg-black" : "fixed", fill && "z-[90] bg-black", rect && !fill && !stg.full && "rounded-[12px]", mini && "flex flex-col rounded-[14px] border border-border bg-surface shadow-[0_8px_30px_rgba(0,0,0,0.25)]", kind === "audio" && !mini && "bg-transparent")}>
      {kind === "audio" ? (
        <div className={cn("flex items-center gap-2", mini ? "p-2" : "h-full")}>
          <AudioEngine item={item} />
        </div>
      ) : (
        <div className={cn("relative bg-black", mini ? (tall ? "aspect-[9/16] max-h-[300px]" : "aspect-video") : "size-full")}>
          <div ref={setHost} className="size-full [&>div]:size-full [&_iframe]:size-full" />
          {kind === "youtube" && <YouTubeEngine item={item} host={host} />}
          {kind === "playlist" && <PlaylistEngine item={item} host={host} />}
          {kind === "embed" && host && <iframe src={item.embed} title={item.title} allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen className="absolute inset-0 size-full border-0" onLoad={() => setPlaying(true)} />}
          {fill && pseudo && <button onClick={() => setPseudoFor(null)} aria-label="Leave full screen" className="absolute right-3 top-3 grid size-10 place-items-center rounded-full bg-black/60 text-[20px] text-white">×</button>}
        </div>
      )}
      {mini && (
        <div className="flex items-center gap-1 px-1.5 py-1.5">
          <span onPointerDown={dragStart} onPointerMove={dragMove} onPointerUp={dragEnd} onPointerCancel={() => { dragging.current = null; setDrag(null); }} title="Drag to move" aria-label="Drag to move the player"
            className="grid size-8 shrink-0 cursor-grab touch-none place-items-center rounded-full text-muted hover:bg-surface-2 active:cursor-grabbing">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden><circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" /></svg>
          </span>
          <button onClick={() => router.push(stg.home)} className="min-w-0 flex-1 truncate text-left text-[12.5px] font-medium hover:underline" title="Back to where it was playing">{item.title}</button>
          {kind !== "embed" && (
            <button aria-label={stg.playing ? "Pause" : "Play"} onClick={() => (stg.playing ? stageCommands().pause?.() : stageCommands().play?.())} className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-surface-2">
              {stg.playing ? <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M7 5h4v14H7zM13 5h4v14h-4z" /></svg> : <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M8 5v14l11-7z" /></svg>}
            </button>
          )}
          <button aria-label="Back to the page" onClick={() => router.push(stg.home)} className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-surface-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
          </button>
          <button aria-label="Stop" onClick={closeStage} className="grid size-8 shrink-0 place-items-center rounded-full text-[18px] hover:bg-surface-2">×</button>
        </div>
      )}
    </div>
  );
}
