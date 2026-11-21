"use client";
// The one player for the whole app. A page shows a picture with a play button; tapping it plays
// the video here, drawn over the page's spot for it. Leave the page or scroll it away and the
// video shrinks to a mini-player in the corner and keeps playing; tap it to go back.

import { useSyncExternalStore } from "react";
import type { Item } from "./model";
import { recordPlay } from "./watch";

export interface StageCommands { play?(): void; pause?(): void; jump?(videoId: string, seconds?: number): void }

interface StageState {
  item: Item | null;
  home: string;              // the page it was started from
  slot: HTMLElement | null;  // the page's spot for it, while that page is open
  playing: boolean;
  full: boolean;             // in real full screen
  tick: number;
}

let s: StageState = { item: null, home: "/today", slot: null, playing: false, full: false, tick: 0 };
const subs = new Set<() => void>();
let commands: StageCommands = {};
let pendingJump: { id: string; seconds?: number } | null = null;

function set(p: Partial<StageState>) { s = { ...s, ...p, tick: s.tick + 1 }; subs.forEach(f => f()); }
export const stage = () => s;
export function useStage() { return useSyncExternalStore(cb => { subs.add(cb); return () => subs.delete(cb); }, () => s, () => s); }

/** Plays an item (replacing what was playing). */
export function playOnStage(item: Item, home: string) {
  if (s.item?.id === item.id) { commands.play?.(); return; }
  commands = {};
  recordPlay(item); // count what you watch, for Progress
  set({ item, home, playing: false });
}
export function closeStage() { commands = {}; set({ item: null, slot: null, playing: false }); }
export function setSlot(el: HTMLElement | null, itemId: string) {
  if (s.item?.id !== itemId) return;
  if (s.slot === el) return;
  set({ slot: el });
}
export const setPlaying = (playing: boolean) => { if (s.playing !== playing) set({ playing }); };
export const setFull = (full: boolean) => { if (s.full !== full) set({ full }); };
export function setCommands(c: StageCommands) {
  commands = c;
  if (pendingJump && c.jump) { const j = pendingJump; pendingJump = null; c.jump(j.id, j.seconds); }
}
export const stageCommands = () => commands;
/** Jumps to a video in the playing playlist (waits for the player if it's still starting). */
export function jumpTo(id: string, seconds?: number) {
  if (commands.jump) commands.jump(id, seconds); else pendingJump = { id, seconds };
}
