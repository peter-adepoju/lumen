"use client";
import { useEffect, useRef } from "react";
import type { Item, Progress } from "@/lib/model";
import { youtubeIds } from "@/lib/links";
import { store } from "@/lib/store/store";
import { PlaylistPlayer } from "./playlist-player";

/* Minimal typing for the YouTube IFrame API. */
export interface YTPlayer { getCurrentTime(): number; getDuration(): number; getPlaylistIndex(): number; destroy(): void; loadVideoById?(o: { videoId: string; startSeconds?: number }): void; cueVideoById?(o: { videoId: string; startSeconds?: number }): void; playVideo?(): void }
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

/** Plays an item inside Lumen where the platform allows it, and remembers where the person stopped. */
export function Player({ item }: { item: Item }) {
  const host = useRef<HTMLDivElement>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const yt = youtubeIds(item.url);
  // Playlists have their own player (oldest first, episode list, new episodes); this one plays single videos.
  const isYouTube = !!yt.video && !yt.playlist;

  useEffect(() => {
    if (!isYouTube || !host.current) return;
    let player: YTPlayer | null = null, timer: ReturnType<typeof setInterval> | null = null, gone = false;
    const saved = store.get("progress")?.[item.id];
    const start = saved && !saved.done && (saved.seconds ?? 0) > 10 ? Math.floor((saved.seconds ?? 0) - 3) : 0;
    loadYouTube().then(YT => {
      if (gone || !host.current) return;
      const el = document.createElement("div"); host.current.appendChild(el);
      player = new YT.Player(el, {
        host: "https://www.youtube-nocookie.com",
        width: "100%", height: "100%",
        videoId: yt.video,
        playerVars: {
          rel: 0, modestbranding: 1, playsinline: 1, start,
          ...(yt.playlist ? { listType: "playlist", list: yt.playlist, index: saved?.index ?? 0 } : {}),
        },
        events: {
          onStateChange: (e: { data: number }) => { if (e.data === 0 && player) { const d = player.getDuration(); saveProgress(item.id, { seconds: d, duration: d, done: !yt.playlist }); } },
        },
      });
      timer = setInterval(() => {
        if (!player?.getCurrentTime) return;
        const s = player.getCurrentTime(), d = player.getDuration();
        if (s > 5) saveProgress(item.id, { seconds: Math.floor(s), duration: Math.floor(d) || undefined, index: yt.playlist ? player.getPlaylistIndex() : undefined });
      }, 8000);
    });
    return () => { gone = true; if (timer) clearInterval(timer); try { player?.destroy(); } catch {} };
  }, [isYouTube, item.id, yt.video, yt.playlist]);

  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    const saved = store.get("progress")?.[item.id];
    const onMeta = () => { if (saved && !saved.done && (saved.seconds ?? 0) > 10) a.currentTime = (saved.seconds ?? 0) - 3; };
    const onTime = () => { if (Math.floor(a.currentTime) % 10 === 0 && a.currentTime > 5) saveProgress(item.id, { seconds: Math.floor(a.currentTime), duration: Math.floor(a.duration) || undefined }); };
    const onEnd = () => saveProgress(item.id, { seconds: Math.floor(a.duration), duration: Math.floor(a.duration), done: true });
    a.addEventListener("loadedmetadata", onMeta); a.addEventListener("timeupdate", onTime); a.addEventListener("ended", onEnd);
    return () => { a.removeEventListener("loadedmetadata", onMeta); a.removeEventListener("timeupdate", onTime); a.removeEventListener("ended", onEnd); };
  }, [item.id]);

  if (yt.playlist) return <PlaylistPlayer item={item} />;
  if (isYouTube) return <div ref={host} className="aspect-video w-full overflow-hidden rounded-[12px] bg-black [&>div]:size-full [&_iframe]:size-full" />;
  if (item.kind === "podcast" && item.embed && /\.(mp3|m4a|aac)(\?|$)/i.test(item.embed)) {
    return (
      <div className="flex items-center gap-4 rounded-[12px] border border-border p-3">
        {item.thumb && <img src={item.thumb} alt="" className="size-20 rounded-[10px] object-cover" />}
        <audio ref={audio} controls preload="metadata" src={item.embed} className="w-full">Your browser can&apos;t play this episode.</audio>
      </div>
    );
  }
  if (item.embed && /^https:\/\/(www\.tiktok\.com\/player|player\.vimeo\.com|embed\.ted\.com)/.test(item.embed)) {
    const tall = item.kind === "clip";
    return <iframe src={item.embed} title={item.title} allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen className={tall ? "mx-auto aspect-[9/16] w-full max-w-[340px] rounded-[12px]" : "aspect-video w-full rounded-[12px]"} />;
  }
  return null;
}
