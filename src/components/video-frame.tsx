"use client";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { cn } from "./ui";

// Watching sideways. While a video plays, turning the phone to landscape makes it fill the screen
// (turn it back to return to the page; the video keeps playing). "Full screen" goes properly full
// screen and turns to landscape where the phone allows it, and YouTube's own full-screen button
// turns to landscape too.

const LANDSCAPE_PHONE = "(orientation: landscape) and (max-height: 560px)";
function useLandscapePhone() {
  return useSyncExternalStore(
    cb => { const m = matchMedia(LANDSCAPE_PHONE); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); },
    () => matchMedia(LANDSCAPE_PHONE).matches,
    () => false,
  );
}

type Lockable = ScreenOrientation & { lock?: (o: "landscape") => Promise<void>; unlock?: () => void };
const orientation = () => (typeof screen !== "undefined" ? (screen.orientation as Lockable | undefined) : undefined);
const lockLandscape = () => { try { void orientation()?.lock?.("landscape")?.catch(() => {}); } catch {} };
const unlock = () => { try { orientation()?.unlock?.(); } catch {} };

// One listener for the whole app: entering full screen from inside a video (YouTube's button) turns to landscape.
let listening = false;
function listenForFullscreen() {
  if (listening || typeof document === "undefined") return;
  listening = true;
  document.addEventListener("fullscreenchange", () => {
    const el = document.fullscreenElement;
    if (el && (el.tagName === "IFRAME" || el.closest?.("[data-video-frame]"))) lockLandscape();
    else if (!el) unlock();
  });
}

/** Wraps a video player. `playing` (from the player) lets it fill the screen when the phone turns sideways. */
export function VideoFrame({ children, playing, tall }: { children: ReactNode; playing: boolean; tall?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const landscape = useLandscapePhone();
  const [full, setFull] = useState(false);       // real full screen
  const [pseudo, setPseudo] = useState(false);   // where the browser has no full screen for elements (iPhone)
  const [engaged, setEngaged] = useState(false); // you tapped into the video (its own controls)
  useEffect(listenForFullscreen, []);
  // A tap inside the video's frame moves focus into it: that counts as watching.
  useEffect(() => {
    const blur = () => setTimeout(() => { if (box.current && document.activeElement && box.current.contains(document.activeElement)) setEngaged(true); }, 0);
    window.addEventListener("blur", blur);
    return () => window.removeEventListener("blur", blur);
  }, []);
  useEffect(() => {
    const on = () => setFull(document.fullscreenElement === box.current);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  const fill = !full && (pseudo || ((playing || engaged) && landscape));
  useEffect(() => {
    if (!fill) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setPseudo(false); };
    window.addEventListener("keydown", k);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", k); };
  }, [fill]);

  async function goFull() {
    const el = box.current as (HTMLDivElement & { webkitRequestFullscreen?: () => void }) | null;
    if (!el) return;
    if (el.requestFullscreen) {
      try { await el.requestFullscreen({ navigationUI: "hide" }); lockLandscape(); return; } catch {}
    }
    if (el.webkitRequestFullscreen) { el.webkitRequestFullscreen(); return; }
    setPseudo(true);
  }

  return (
    <div className="flex flex-col gap-1">
      <div ref={box} data-video-frame=""
        className={cn("overflow-hidden bg-black", fill ? "fixed inset-0 z-[90] grid place-items-center" : full ? "grid place-items-center" : "rounded-[12px]")}>
        <div className={cn(fill || full ? "size-full" : tall ? "mx-auto aspect-[9/16] w-full max-w-[340px]" : "aspect-video w-full", "[&>div]:size-full [&_iframe]:size-full")}>{children}</div>
        {fill && pseudo && (
          <button onClick={() => setPseudo(false)} aria-label="Leave full screen" className="absolute right-3 top-3 grid size-10 place-items-center rounded-full bg-black/60 text-[20px] text-white">×</button>
        )}
      </div>
      {!fill && !full && (
        <button onClick={() => void goFull()} className="self-end inline-flex items-center gap-1.5 text-[12.5px] text-muted hover:text-fg">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
          Full screen
        </button>
      )}
    </div>
  );
}
