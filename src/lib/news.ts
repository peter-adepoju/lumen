// The daily news brief: real headlines from Google News (via /api/news), with your own
// Gemini key (no web search needed) choosing and labelling the ones that matter.
import type { Block, NewsItem, NewsStatus } from "./model";
import { itemId } from "./links";

export interface Headline { title: string; url: string; source: string; sourceUrl?: string; date?: string }
const STATUSES: NewsStatus[] = ["Confirmed", "Reported", "Rumour", "Fixture", "Research"];

/** Drops headlines that match something you've blocked (a word, topic, creator or outlet). */
export function withoutBlocked(items: Headline[], blocked: Block[]): Headline[] {
  const words = blocked.filter(b => b.type !== "item").map(b => b.value.toLowerCase()).filter(Boolean);
  return items.filter(h => !words.some(w => h.title.toLowerCase().includes(w) || h.source.toLowerCase().includes(w)));
}

/** Asks the AI to pick from these real headlines only; it never writes its own. */
export function rankPrompt(topic: string, items: Headline[], max = 5): string {
  return [
    `Here are today's headlines about "${topic}", numbered. Pick the ${max} most important, distinct stories for someone who follows ${topic}. If several headlines are the same story, pick only one of them (prefer the most official or established outlet). Skip anything not really about ${topic}.`,
    `Label each pick from its headline only: Confirmed (officially announced), Reported (a credible outlet says so, not yet official), Rumour (speculation, "linked with", "could", "eyeing"), Fixture (a scheduled match or event), or Research (a study or report).`,
    items.map((h, i) => `${i}. ${h.title} (${h.source}${h.date ? ", " + h.date.slice(0, 10) : ""})`).join("\n"),
    `Reply with JSON only: [{"i": 0, "status": "Confirmed"}] in order of importance.`,
  ].join("\n\n");
}

/** Marks the stories you didn't have before a refresh (by link, or by headline when the link changed). */
export function markFresh(next: NewsItem[], before: NewsItem[] | undefined): NewsItem[] {
  if (!before) return next;
  const key = (t: string) => t.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  const ids = new Set(before.map(n => n.id)), titles = new Set(before.map(n => key(n.title)));
  return next.map(n => (ids.has(n.id) || titles.has(key(n.title)) ? { ...n, fresh: false } : { ...n, fresh: true }));
}

/** Turns the AI's picks into stories, keeping each headline's real link and outlet. Falls back to the newest headlines. */
export function toStories(raw: unknown, items: Headline[], topic: string, max = 5): NewsItem[] {
  const picks = (Array.isArray(raw) ? raw : []).filter((p): p is { i: number; status?: string } => !!p && Number.isInteger(p.i) && p.i >= 0 && p.i < items.length);
  const firstPicks = picks.filter((p, k) => picks.findIndex(q => q.i === p.i) === k); // the same headline twice: the first pick wins
  const chosen = firstPicks.length ? firstPicks.slice(0, max) : items.slice(0, max).map((_, i) => ({ i, status: "Reported" }));
  return chosen.map(({ i, status }) => {
    const h = items[i];
    return { id: itemId(h.url), topic, title: h.title, summary: "", status: STATUSES.includes(status as NewsStatus) ? (status as NewsStatus) : "Reported", source: h.source, url: h.url, date: h.date?.slice(0, 10) };
  });
}
