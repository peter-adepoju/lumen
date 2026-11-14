// Your interests start with the ones you picked at setup. As you use Lumen (what you save, like,
// search for and finish), your own AI looks for new interests that keep coming up, and asks you
// before adding any. Nothing is added without your yes.

import type { Activity, Area, Category, InterestsState, InterestSuggestion, Profile } from "./model";
import { CATEGORY_NAME, makeArea, slug } from "./model";

export const EMPTY_INTERESTS: InterestsState = { lastRun: 0, lastCount: 0, suggestions: [] };
const DAY = 86400_000;

/** Adds one activity, newest last, keeping the most recent 600. */
export function addActivity(list: Activity[] | undefined, a: Omit<Activity, "at">, now = Date.now()): Activity[] {
  const text = a.text.trim().slice(0, 200);
  if (!text) return list ?? [];
  const prev = list ?? [];
  // the same search typed twice in a row counts once
  const last = prev[prev.length - 1];
  if (last && last.kind === a.kind && last.text === text && now - last.at < 10 * 60_000) return prev;
  return [...prev, { ...a, text, at: now }].slice(-600);
}

/** Time to look again: enough new activity since the last look (8 things), and at least two days apart. */
export function shouldLook(state: InterestsState | undefined, activity: Activity[] | undefined, now = Date.now()): boolean {
  const s = state ?? EMPTY_INTERESTS;
  const n = activity?.length ?? 0;
  if (n - s.lastCount < 8) return false;
  return now - s.lastRun > 2 * DAY;
}

const CATS: Category[] = ["skill", "lang", "career", "mind", "interest", "news"];

export function interestPrompt(profile: Profile, activity: Activity[], declined: string[]): string {
  const areas = profile.areas.map(a => `${a.name} (${CATEGORY_NAME[a.cat]})`);
  const lines = activity.slice(-150).map(a => `${new Date(a.at).toISOString().slice(0, 10)} ${a.kind}: ${a.text}${a.area ? ` [${a.area}]` : ""}`);
  return [
    `You help a learning app notice new interests from what one person actually does. Their interests now: ${areas.join(", ") || "none"}.`,
    profile.goal ? `Their goal: "${profile.goal.slice(0, 300)}".` : "",
    declined.length ? `They already said no to: ${declined.join(", ")}. Never suggest these or near-synonyms.` : "",
    `Their recent activity (what they saved, liked, disliked, searched for, finished or added):\n${lines.join("\n")}`,
    `Find at most 3 NEW interests that clearly keep coming up (at least 3 separate activities each), that aren't already covered by their interests above. Prefer a specific, useful name ("Street photography", "Spanish", "Personal finance", "Chelsea FC") over a vague one. Ignore one-offs and things they disliked. If nothing is clear, return [].`,
    `Pick the category that fits: skill (something to get better at), lang (a language), career, mind (habits, health, wellbeing), interest (a hobby or subject), news (something to follow in the news).`,
    `Reply with JSON only: [{"name": "short name", "cat": "skill|lang|career|mind|interest|news", "why": "one friendly sentence to the person, naming what you noticed", "evidence": ["up to 4 short items from their activity"]}]`,
  ].filter(Boolean).join("\n\n");
}

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Keeps only real, new suggestions: not already an interest, not said no to, not already waiting. */
export function toSuggestions(raw: unknown, profile: Profile, state: InterestsState | undefined, now = Date.now()): InterestSuggestion[] {
  const s = state ?? EMPTY_INTERESTS;
  const taken = new Set([...profile.areas.map(a => norm(a.name)), ...s.suggestions.filter(x => x.status !== "later" || (x.until ?? 0) > now).map(x => norm(x.name))]);
  const out: InterestSuggestion[] = [];
  for (const r of Array.isArray(raw) ? raw : []) {
    const x = r as Record<string, unknown>;
    const name = String(x?.name ?? "").trim().slice(0, 60);
    if (name.length < 2 || taken.has(norm(name))) continue;
    const n = norm(name);
    if (profile.areas.some(a => { const m = norm(a.name); return m.includes(n) || (m.length > 3 && n.includes(m)); })) continue;
    taken.add(norm(name));
    out.push({
      id: slug(name), name, cat: CATS.includes(x.cat as Category) ? (x.cat as Category) : "interest",
      why: String(x.why ?? "").slice(0, 240), evidence: (Array.isArray(x.evidence) ? x.evidence : []).map(e => String(e).slice(0, 120)).slice(0, 4),
      at: now, status: "open",
    });
    if (out.length >= 3) break;
  }
  return out;
}

/** The suggestions to ask about now. */
export function openSuggestions(state: InterestsState | undefined, now = Date.now()): InterestSuggestion[] {
  return (state?.suggestions ?? []).filter(x => x.status === "open" || (x.status === "later" && (x.until ?? 0) <= now));
}

/** Records the person's answer. "yes" also returns the new area to add. */
export function answer(state: InterestsState | undefined, id: string, reply: "yes" | "later" | "no", cat?: Category, now = Date.now()): { state: InterestsState; area?: Area } {
  const s = state ?? EMPTY_INTERESTS;
  const sug = s.suggestions.find(x => x.id === id);
  const next: InterestsState = {
    ...s,
    suggestions: s.suggestions.map(x => (x.id !== id ? x : reply === "yes" ? { ...x, status: "added", cat: cat ?? x.cat } : reply === "later" ? { ...x, status: "later", until: now + 14 * DAY } : { ...x, status: "no" })),
  };
  if (reply !== "yes" || !sug) return { state: next };
  return { state: next, area: { ...makeArea(sug.name, cat ?? sug.cat), from: "noticed" } };
}
