// Picks each day's focus from the user's areas. Pure, so it is the same on every device.
import type { Area, PlanMode } from "./model";

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Days since 1970-01-01 in the user's local calendar. */
export function dayNumber(d: Date): number {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);
}

/**
 * The order focus days cycle through. Weekly and Daily areas appear once per
 * cycle, starred areas twice, and "Sometimes" areas once every second cycle.
 * Paused areas and news topics never become a day's focus.
 */
export function rotation(areas: Area[]): Area[] {
  const live = areas.filter(a => a.cat !== "news" && (a.freq === "Weekly" || a.freq === "Daily"));
  const some = areas.filter(a => a.cat !== "news" && a.freq === "Sometimes");
  const round: Area[] = [];
  for (const a of live) { round.push(a); if (a.star) round.push(a); }
  if (!round.length) return some;
  return some.length ? [...spread(round), ...spread([...round, ...some])] : spread(round);
}

/** Moves repeated (starred) entries apart so the same area doesn't land on two days in a row. */
function spread(seq: Area[]): Area[] {
  const out: Area[] = [];
  const rest = [...seq];
  while (rest.length) {
    const i = rest.findIndex(a => out.length === 0 || a.id !== out[out.length - 1].id);
    out.push(...rest.splice(i < 0 ? 0 : i, 1));
  }
  return out;
}

/** Sunday is the weekly review day. */
export function isReviewDay(d: Date): boolean {
  return d.getDay() === 0;
}

export function focusFor(areas: Area[], mode: PlanMode, d: Date): Area | null {
  if (isReviewDay(d)) return null;
  const seq = rotation(areas);
  if (!seq.length) return null;
  if (mode === "Same focus every day") return areas.find(a => a.star && a.freq !== "Paused" && a.cat !== "news") ?? seq[0];
  // Count only Monday–Saturday so the order isn't shifted by review days.
  const n = dayNumber(d), weeks = Math.floor((n + 3) / 7), workday = weeks * 6 + ((d.getDay() + 6) % 7);
  return seq[((workday % seq.length) + seq.length) % seq.length];
}

/** Areas practised every day alongside the focus (languages set to Daily, for example). */
export function dailyExtras(areas: Area[], focus: Area | null): Area[] {
  return areas.filter(a => a.freq === "Daily" && a.cat !== "news" && a.id !== focus?.id);
}

export function weekPlan(areas: Area[], mode: PlanMode, from: Date): { date: Date; label: string; focus: Area | null }[] {
  const monday = new Date(from.getFullYear(), from.getMonth(), from.getDate() - ((from.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    return { date, label: DAY_NAMES[date.getDay()], focus: mode === "I choose each day" ? null : focusFor(areas, mode, date) };
  });
}

export function greeting(d: Date): string {
  const h = d.getHours();
  return h >= 5 && h < 12 ? "Good morning" : h >= 12 && h < 17 ? "Good afternoon" : "Good evening";
}
