// The Sunday weekly review: a look back at the last seven days. Pure.
import type { Docs, JournalEntry } from "./model";
import { addDays } from "./practice";

export interface WeekSummary {
  from: string; to: string;
  days: number; sessions: number; minutes: number;
  areas: { area: string; sessions: number }[];
  drills: number; quizzes: { right: number; out: number };
  highlights: number; finished: number;
  picksDone: number;
}

/** What happened from six days before `day` up to `day`. */
export function weekSummary(d: Partial<Docs>, day: string): WeekSummary {
  const from = addDays(day, -6), inWeek = (x?: string | null) => !!x && x >= from && x <= day;
  const start = Date.parse(from + "T00:00:00"), end = Date.parse(addDays(day, 1) + "T00:00:00");
  const atIn = (t?: number) => typeof t === "number" && t >= start && t < end;
  const sessions = (d.stats?.sessions ?? []).filter(s => inWeek(s.day) && s.area !== "review");
  const byArea = new Map<string, number>();
  sessions.forEach(s => byArea.set(s.area, (byArea.get(s.area) ?? 0) + 1));
  const drills = (d.drills ?? []).filter(x => inWeek(x.day));
  const qs = drills.filter(x => x.kind === "quiz");
  const reading = Object.values(d.reading ?? {});
  return {
    from, to: day,
    days: new Set(sessions.map(s => s.day)).size,
    sessions: sessions.length,
    minutes: sessions.reduce((n, s) => n + s.minutes, 0),
    areas: [...byArea.entries()].map(([area, n]) => ({ area, sessions: n })).sort((a, b) => b.sessions - a.sessions),
    drills: drills.length - qs.length,
    quizzes: { right: qs.reduce((n, q) => n + q.score, 0), out: qs.reduce((n, q) => n + (q.out ?? 0), 0) },
    highlights: reading.reduce((n, r) => n + (r?.hl ?? []).filter(h => atIn(h.at)).length, 0),
    finished: (d.library ?? []).filter(b => b.shelf === "finished" && atIn(b.lastReadAt)).length,
    picksDone: Object.values(d.progress ?? {}).filter(p => p.done && atIn(p.at)).length,
  };
}

export const REVIEW_PROMPTS = [
  { key: "well", label: "What went well this week?" },
  { key: "hard", label: "What was hard, and why?" },
  { key: "next", label: "One thing to do differently next week" },
] as const;

/** The review's answers are saved privately in the journal, like reflections. */
export function reviewEntry(day: string, answers: Record<string, string>): JournalEntry {
  const text = REVIEW_PROMPTS.filter(p => answers[p.key]?.trim()).map(p => `${p.label}\n${answers[p.key].trim()}`).join("\n\n");
  return { day, area: "review", text, at: Date.parse(day + "T12:00:00") };
}
