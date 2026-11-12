// Streaks and lumens. Pure, so every device agrees.
import type { SessionRecord, Stats } from "./model";

export const LUMENS = { "Warm-up": 10, Learn: 20, Practise: 30, Reflect: 10 } as const;
export const LEVELS: [string, number][] = [["Spark", 0], ["Glow", 1000], ["Lamp", 3000], ["Beacon", 7000], ["Radiance", 15000]];

export const emptyStats = (): Stats => ({ streak: 0, best: 0, lastDay: null, lumens: 0, sessions: [] });

function dayBefore(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d - 1));
  return t.toISOString().slice(0, 10);
}

/** The streak as it stands today: it drops to 0 once a full day has been missed. */
export function currentStreak(s: Stats, day: string): number {
  if (!s.lastDay) return 0;
  return s.lastDay === day || s.lastDay === dayBefore(day) ? s.streak : 0;
}

export function completeSession(s: Stats | undefined, rec: SessionRecord): Stats {
  const st = s ?? emptyStats();
  const streak = st.lastDay === rec.day ? st.streak : st.lastDay === dayBefore(rec.day) ? st.streak + 1 : 1;
  return { streak, best: Math.max(st.best, streak), lastDay: rec.day, lumens: st.lumens + rec.lumens, sessions: [...st.sessions, rec].slice(-400) };
}

export function level(lumens: number) {
  let i = 0;
  while (i + 1 < LEVELS.length && lumens >= LEVELS[i + 1][1]) i++;
  const [name, from] = LEVELS[i], next = LEVELS[i + 1];
  return { name, next: next?.[0] ?? null, toNext: next ? next[1] - lumens : 0, pct: next ? Math.round(((lumens - from) / (next[1] - from)) * 100) : 100 };
}

/** Lumens for practice outside the daily session. The streak is only kept by sessions. */
export function addLumens(s: Stats | undefined, n: number): Stats {
  const st = s ?? emptyStats();
  return { ...st, lumens: st.lumens + Math.max(0, Math.round(n)) };
}
