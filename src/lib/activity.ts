"use client";
// Writes what you do (saves, likes, searches, things you finish) to your own activity log, which
// only your own AI reads, to notice new interests. See interests.ts.

import type { Activity } from "./model";
import { addActivity } from "./interests";
import { store } from "./store/store";

export function logActivity(kind: Activity["kind"], text: string, area?: string) {
  if (!text?.trim()) return;
  void store.update("activity", l => addActivity(l, { kind, text, ...(area ? { area } : {}) }));
}
