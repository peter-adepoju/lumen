"use client";
import { useSyncExternalStore } from "react";
import { cn } from "./ui";

/* Installing Lumen as an app. Chrome and Edge (on PCs, Macs, Android and Chromebooks) tell
   the page when it can be installed; Lumen keeps that signal and shows its own button. */

interface InstallPrompt extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> }
let deferred: InstallPrompt | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(f => f());
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferred = e as InstallPrompt; emit(); });
  window.addEventListener("appinstalled", () => { deferred = null; installed = true; emit(); });
}

export type InstallState = "installed" | "ready" | "unavailable";
const snapshot = (): InstallState => {
  if (installed || (typeof window !== "undefined" && (window.matchMedia?.("(display-mode: standalone)").matches || window.matchMedia?.("(display-mode: window-controls-overlay)").matches))) return "installed";
  return deferred ? "ready" : "unavailable";
};
export function useInstall(): InstallState {
  return useSyncExternalStore(f => { listeners.add(f); return () => { listeners.delete(f); }; }, snapshot, () => "unavailable");
}
export async function install(): Promise<boolean> {
  if (!deferred) return false;
  const p = deferred;
  await p.prompt();
  const { outcome } = await p.userChoice;
  if (outcome === "accepted") { deferred = null; emit(); }
  return outcome === "accepted";
}

/** "Install app": shown only when the browser says Lumen can be installed and it isn't yet. */
export function InstallButton({ className }: { className?: string }) {
  const state = useInstall();
  if (state !== "ready") return null;
  return (
    <button onClick={() => void install()} title="Install Lumen as an app on this device"
      className={cn("inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[13.5px] hover:bg-surface-2", className)}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 4v10M8 10l4 4 4-4" /><rect x="3.5" y="15.5" width="17" height="4.5" rx="1.5" /></svg>
      Install app
    </button>
  );
}

/** How to install on this device, for You. */
export function installHelp(ua: string): string {
  if (/iPhone|iPad|iPod/.test(ua)) return "In Safari, tap Share, then Add to Home Screen.";
  if (/Android/.test(ua)) return "In Chrome, open the menu (⋮) and choose Install app.";
  if (/Firefox\//.test(ua)) return "Firefox can't install apps. Open Lumen in Chrome or Edge to install it.";
  if (/Macintosh/.test(ua) && /Safari\//.test(ua) && !/Chrome\/|Edg\//.test(ua)) return "In Safari, choose File, then Add to Dock.";
  if (/Edg\//.test(ua)) return "In Edge, click the app icon in the address bar, or open the menu (…) and choose Apps, then Install Lumen.";
  return "In Chrome, click the install icon at the right of the address bar, or open the menu (⋮) and choose Cast, save and share, then Install page as app.";
}
