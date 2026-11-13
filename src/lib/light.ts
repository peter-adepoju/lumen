// Your light: how bright the orb glows, from what you actually did.
// Pure, so every device shows the same light for the same data.
import type { Docs } from "./model";
import { addDays } from "./practice";

export type LightState = "new" | "shining" | "lit" | "waiting" | "dimming" | "ember";

export interface Light {
  /** 0.1 (an ember) to 1 (shining). Drives the orb's brightness, size of glow and pace. */
  level: number;
  state: LightState;
  /** Days with any learning in the last 7, today included. */
  week: number;
  /** Full days missed since you last learned (0 if you learned today or yesterday). */
  missed: number;
  label: string;
  detail: string;
}

/** Every day with some learning: a session or review counts fully; practice, games and reading count too. */
export function learningDays(d: Partial<Docs>): { full: Set<string>; any: Set<string> } {
  const full = new Set((d.stats?.sessions ?? []).map(s => s.day));
  const any = new Set(full);
  (d.drills ?? []).forEach(x => any.add(x.day));
  (d.games ?? []).forEach(x => any.add(x.day));
  (d.journal ?? []).forEach(x => any.add(x.day));
  Object.values(d.reading ?? {}).forEach(r => { if (r?.day && r.readToday?.length) any.add(r.day); });
  return { full, any };
}

const between = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 864e5);

/**
 * How the light behaves:
 * - A session today: shining (full brightness). Practice, a game or reading without a session: lit (a little less).
 * - Learned yesterday but not yet today: still bright, waiting for you.
 * - Each full day missed dims it: about two thirds after 1 day, half after 2, a third after 3,
 *   and after a week it is an ember. It never goes out completely, and one session relights it.
 * - Learning on more of the last 7 days makes the whole light stronger.
 */
export function light(d: Partial<Docs>, today: string): Light {
  const { full, any } = learningDays(d);
  const past = [...any].filter(x => x <= today).sort();
  if (!past.length) return { level: 0.55, state: "new", week: 0, missed: 0, label: "Your light starts today", detail: "Finish a session and it begins to shine." };
  let week = 0;
  for (let i = 0; i < 7; i++) if (any.has(addDays(today, -i))) week++;
  const last = past[past.length - 1], gap = between(last, today), missed = Math.max(0, gap - 1);
  const strength = 0.8 + 0.2 * (week / 7);
  let base: number, state: LightState, label: string, detail: string;
  if (gap === 0 && full.has(today)) { base = 1; state = "shining"; label = "Shining"; detail = "You learned today."; }
  else if (gap === 0) { base = 0.92; state = "lit"; label = "Lit"; detail = "A session today makes it shine."; }
  else if (gap === 1) { base = 0.85; state = "waiting"; label = "Waiting for today"; detail = "Learn today to keep it bright."; }
  else if (missed <= 3) { base = [0.62, 0.45, 0.32][missed - 1]; state = "dimming"; label = `Dimming · ${missed} day${missed === 1 ? "" : "s"} missed`; detail = "One session brings it back."; }
  else if (missed < 7) { base = 0.22; state = "dimming"; label = `Dim · ${missed} days missed`; detail = "One session brings it back."; }
  else { base = 0.12; state = "ember"; label = "An ember"; detail = "It never goes out. Learn today to relight it."; }
  return { level: Math.max(0.1, Math.round(base * strength * 100) / 100), state, week, missed, label, detail };
}
