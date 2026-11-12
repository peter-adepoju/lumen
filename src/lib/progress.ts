// Progress: pure summaries of what the person has done, for the Progress page.
import type { DrillKind, DrillScore, Feedback, SessionRecord } from "./model";
import { addDays } from "./practice";

export interface HeatDay { day: string; minutes: number; sessions: number; future: boolean }

/** A Monday-first grid of the last `weeks` weeks, ending with the week of `day`. */
export function heatmap(sessions: SessionRecord[], day: string, weeks = 12): HeatDay[][] {
  const [y, m, d] = day.split("-").map(Number);
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // Monday = 0
  const start = addDays(day, -dow - (weeks - 1) * 7);
  const by = new Map<string, { minutes: number; sessions: number }>();
  for (const s of sessions) { const e = by.get(s.day) ?? { minutes: 0, sessions: 0 }; e.minutes += s.minutes; e.sessions += 1; by.set(s.day, e); }
  return Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, i) => {
    const dd = addDays(start, w * 7 + i), e = by.get(dd);
    return { day: dd, minutes: e?.minutes ?? 0, sessions: e?.sessions ?? 0, future: dd > day };
  }));
}

/** Sessions and minutes per area, most active first. */
export function areaActivity(sessions: SessionRecord[]): { area: string; sessions: number; minutes: number; last: string }[] {
  const by = new Map<string, { area: string; sessions: number; minutes: number; last: string }>();
  for (const s of sessions) {
    const e = by.get(s.area) ?? { area: s.area, sessions: 0, minutes: 0, last: s.day };
    e.sessions += 1; e.minutes += s.minutes; if (s.day > e.last) e.last = s.day;
    by.set(s.area, e);
  }
  return [...by.values()].sort((a, b) => b.sessions - a.sessions || b.last.localeCompare(a.last));
}

/** A level for one area from its session count: every 5 sessions is a level, up to 10. */
export function areaLevel(sessions: number): { level: number; pct: number } {
  const level = Math.min(10, 1 + Math.floor(sessions / 5));
  return { level, pct: level === 10 ? 100 : Math.round(((sessions % 5) / 5) * 100) };
}

/** The last `n` scores of one drill, oldest first. */
export function drillTrend(drills: DrillScore[], kind: DrillKind, n = 20): DrillScore[] {
  return drills.filter(d => d.kind === kind).sort((a, b) => a.at - b.at).slice(-n);
}

/** Creators the person likes or finishes most, and ones they turn down. */
export function tastes(feedback: Feedback[]): { liked: { name: string; n: number }[]; disliked: { name: string; n: number }[] } {
  const count = (pred: (f: Feedback) => boolean) => {
    const by = new Map<string, number>();
    for (const f of feedback) if (pred(f) && f.creator) by.set(f.creator, (by.get(f.creator) ?? 0) + 1);
    return [...by.entries()].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)).slice(0, 8);
  };
  return { liked: count(f => f.rating === "up" || f.rating === "done"), disliked: count(f => f.rating === "down") };
}
