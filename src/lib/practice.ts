// Practice: spaced-repetition flashcards and brain drills. Pure functions.
import type { Card, Grade } from "./model";

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function newCard(p: { id: string; area: string; front: string; back: string; source?: string }, day: string): Card {
  return { ...p, front: p.front.trim(), back: p.back.trim(), due: day, interval: 0, ease: 2.5, reps: 0, lapses: 0, created: Date.now() };
}

/**
 * Schedules a card after a review (a simplified SM-2). "Again" brings it back
 * today; good answers space it further out each time; easy ones further still.
 */
export function review(c: Card, g: Grade, day: string): Card {
  let { interval, ease, reps, lapses } = c;
  if (g === "again") { reps = 0; lapses += 1; interval = 0; ease = Math.max(1.3, ease - 0.2); }
  else if (g === "hard") { interval = Math.max(1, Math.round(Math.max(1, interval) * 1.2)); ease = Math.max(1.3, ease - 0.15); reps += 1; }
  else if (g === "good") { interval = reps === 0 ? 1 : reps === 1 ? 3 : Math.round(interval * ease); reps += 1; }
  else { interval = reps === 0 ? 3 : Math.round(Math.max(1, interval) * ease * 1.3); ease += 0.15; reps += 1; }
  return { ...c, interval, ease: Math.round(ease * 100) / 100, reps, lapses, due: addDays(day, interval) };
}

/** Cards to review today: overdue first, then the rest, at most `limit`. */
export function dueCards(cards: Card[], day: string, limit = 30): Card[] {
  return cards.filter(c => c.due <= day).sort((a, b) => a.due.localeCompare(b.due) || a.created - b.created).slice(0, limit);
}

/** What the next interval would be for each answer, for the buttons ("3 days"). */
export function previewIntervals(c: Card, day: string): Record<Grade, string> {
  const out = {} as Record<Grade, string>;
  for (const g of ["again", "hard", "good", "easy"] as Grade[]) {
    const n = review(c, g, day).interval;
    out[g] = n === 0 ? "now" : n === 1 ? "1 day" : n < 30 ? `${n} days` : n < 365 ? `${Math.round(n / 30)} mo` : `${(n / 365).toFixed(1)} yr`;
  }
  return out;
}

/* ---------- Drills ---------- */

/** A digit-span round: `length` random digits, no digit twice in a row. */
export function digits(length: number, rnd: () => number = Math.random): string {
  let s = "";
  while (s.length < length) { const d = String(Math.floor(rnd() * 10)); if (d !== s[s.length - 1]) s += d; }
  return s;
}

const PAIRS: [string, string][] = [["O", "Q"], ["E", "F"], ["b", "d"], ["p", "q"], ["M", "N"], ["6", "9"], ["C", "G"], ["I", "l"], ["u", "v"], ["8", "B"], ["S", "5"], ["Z", "2"]];

/** An odd-one-out grid: every cell shows the same character except one. Grids grow with the level. */
export function oddGrid(level: number, rnd: () => number = Math.random): { size: number; base: string; odd: string; at: number } {
  const size = Math.min(9, 4 + Math.floor(level / 2));
  const [a, b] = PAIRS[Math.floor(rnd() * PAIRS.length)];
  const flip = rnd() < 0.5;
  return { size, base: flip ? b : a, odd: flip ? a : b, at: Math.floor(rnd() * size * size) };
}
