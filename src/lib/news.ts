// The daily news brief: real headlines from Google News (via /api/news), with your own
// Gemini key (no web search needed) choosing and labelling the ones that matter.
import type { Block, NewsItem, NewsStatus, NewsVideo } from "./model";
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
    return { id: itemId(h.url), topic, title: h.title, summary: "", status: STATUSES.includes(status as NewsStatus) ? (status as NewsStatus) : "Reported", source: h.source, url: h.url, date: h.date?.slice(0, 10), ...(h.sourceUrl ? { sourceUrl: h.sourceUrl } : {}) };
  });
}

// ── Favicons ───────────────────────────────────────────────────────────────
/** The small site icon for an outlet (Google's public favicon service; it only sees the site's name). */
export function faviconFor(url?: string): string | null {
  if (!url) return null;
  try {
    const host = new URL(/^https?:\/\//.test(url) ? url : "https://" + url).hostname.replace(/^www\./, "");
    if (!host || host === "news.google.com") return null;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
  } catch { return null; }
}

// ── Videos ─────────────────────────────────────────────────────────────────
/** A news source that is a YouTube channel (youtube.com/@SkySportsNews, youtube.com/channel/UC…). */
export const isVideoSource = (s: string) => /^(https?:\/\/)?(www\.|m\.)?youtube\.com\/(@|channel\/|c\/|user\/)/i.test(s.trim());

/** Turns what someone typed into a YouTube source, or null if it isn't one. "@SkySports" counts too. */
export function normaliseVideoSource(s: string): string | null {
  const t = s.trim().replace(/^https?:\/\//, "").replace(/^(www\.|m\.)/, "").replace(/\/(videos|featured|streams|shorts)?\/?$/, "");
  if (/^youtube\.com\/(@[A-Za-z0-9._-]{3,100}|channel\/UC[A-Za-z0-9_-]{22}|c\/[A-Za-z0-9._-]+|user\/[A-Za-z0-9._-]+)$/.test(t)) return t;
  if (/^@[A-Za-z0-9._-]{3,100}$/.test(t)) return "youtube.com/" + t;
  return null;
}

/** Official channels to start from when a topic has none of its own (and there's no AI key to suggest some). */
const DEFAULT_CHANNELS: [RegExp, string[]][] = [
  [/formula ?1|\bf1\b|grand prix/i, ["youtube.com/@Formula1", "youtube.com/@SkySportsF1"]],
  [/cricket/i, ["youtube.com/@SkySportsCricket", "youtube.com/@BBCSport"]],
  [/\bnba\b|basketball/i, ["youtube.com/@NBA"]],
  [/football|soccer|premier league|champions league|la ?liga|serie a|bundesliga|transfer|united|city|arsenal|chelsea|liverpool|tottenham|madrid|barcelona|\bfc\b/i, ["youtube.com/@SkySportsFootball", "youtube.com/@SkySportsNews", "youtube.com/@BBCSport"]],
  [/sport/i, ["youtube.com/@SkySportsNews", "youtube.com/@BBCSport"]],
  [/\bai\b|artificial intelligence|tech|gadget|apple|google|software|startup/i, ["youtube.com/@TheVerge", "youtube.com/@BloombergTechnology"]],
  [/business|market|econom|finance|stock|crypto|bitcoin/i, ["youtube.com/@BloombergTelevision", "youtube.com/@FinancialTimes"]],
  [/space|nasa|astronom|science|climate/i, ["youtube.com/@NASA", "youtube.com/@BBCNews"]],
  [/nigeria|lagos|abuja|africa/i, ["youtube.com/@channelstv", "youtube.com/@aljazeeraenglish"]],
];
export function defaultChannels(topic: string): string[] {
  return DEFAULT_CHANNELS.find(([re]) => re.test(topic))?.[1] ?? ["youtube.com/@BBCNews", "youtube.com/@SkyNews", "youtube.com/@aljazeeraenglish"];
}

/** Asks the AI for the official YouTube channels that post videos about a topic. */
export function channelPrompt(topic: string): string {
  return `List up to 4 official YouTube channels that regularly post news or highlight videos about "${topic}": the subject's own official channel if it has one (a club, league, company, government body), then established broadcasters or outlets that cover it. Only real, well-known channels with free videos. Reply with JSON only: ["@handle", …] using each channel's YouTube @handle.`;
}

/** The words that matter in a topic ("Manchester United" → ["manchester", "united"]). */
function topicWords(topic: string): string[] {
  const stop = new Set(["the", "and", "for", "news", "with", "from", "about", "latest", "of", "in", "on"]);
  return topic.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2 && !stop.has(w));
}

/**
 * The videos worth showing for a topic. A channel that is itself about the topic (a club's own channel)
 * counts in full; on general channels (Sky Sports, BBC News) a video must mention the topic in its title.
 */
export function relevantVideos(videos: (NewsVideo & { channel: string })[], topic: string, blocked: Block[] = [], max = 8): NewsVideo[] {
  const words = topicWords(topic);
  const phrase = words.join(" ");
  const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ");
  const need = Math.max(1, Math.ceil(words.length / 2));
  const hits = (s: string) => words.filter(w => norm(s).split(" ").includes(w)).length;
  const blockWords = blocked.filter(b => b.type !== "item").map(b => b.value.toLowerCase()).filter(Boolean);
  return videos
    .filter(v => !blockWords.some(w => v.title.toLowerCase().includes(w) || v.channel.toLowerCase().includes(w)))
    .filter(v => !words.length || norm(v.title).includes(phrase) || hits(v.title) >= need || hits(v.channel) >= need)
    .slice(0, max)
    .map(({ id, title, channel, date, thumb, url }) => ({ id, title, channel, date, thumb, url }));
}
