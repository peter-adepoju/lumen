// AI parts of Practice, News and Unwind, run with the person's own Gemini key.
import type { Area, Block, NewsItem, NewsStatus, Profile, UnwindPick } from "./model";
import { generateJson } from "./gemini";
import { itemId } from "./links";
import type { Question } from "./session-ai";

const goal = (p: Profile) => (p.goal ? `Their goal: "${p.goal.slice(0, 300)}".` : "");

export async function quiz(key: string, topic: string, p: Profile, n = 5): Promise<Question[]> {
  const qs = await generateJson<Question[]>(key, [
    `Write ${n} multiple-choice questions on "${topic}" for a curious adult who is getting better at it. ${goal(p)}`,
    `Mix easy and harder questions. Each has 4 short options, exactly one correct, and a one-sentence explanation. Facts must be accurate and not time-sensitive.`,
    `Reply with JSON only: [{"q": "...", "options": ["...","...","...","..."], "answer": 0-3, "explain": "..."}]`,
  ].join("\n"));
  return (Array.isArray(qs) ? qs : []).filter(q => q && Array.isArray(q.options) && q.options.length === 4 && q.answer >= 0 && q.answer < 4).slice(0, n);
}

export async function makeCards(key: string, area: Area, p: Profile, n = 10, have: string[] = []): Promise<{ front: string; back: string }[]> {
  const lang = area.cat === "lang";
  const cards = await generateJson<{ front: string; back: string }[]>(key, [
    lang ? `Make ${n} flashcards for a learner of ${area.name}: useful everyday words and short phrases, at a level that fits them. Front: the ${area.name} word or phrase. Back: the English meaning, then a short example sentence in ${area.name} with its translation.`
      : `Make ${n} flashcards that help someone remember the key ideas, terms and techniques of "${area.name}". Front: a short question. Back: a short, accurate answer.`,
    goal(p),
    have.length ? `They already have cards for: ${have.slice(-40).join("; ")}. Don't repeat them.` : "",
    `Reply with JSON only: [{"front": "...", "back": "..."}]`,
  ].filter(Boolean).join("\n"));
  return (Array.isArray(cards) ? cards : []).filter(c => c && typeof c.front === "string" && typeof c.back === "string" && c.front.trim() && c.back.trim()).slice(0, n);
}

/** Turns a book highlight into a question that tests recall of its idea. */
export async function cardFromHighlight(key: string | undefined, text: string, book: string, note?: string): Promise<{ front: string; back: string }> {
  if (key) {
    try {
      const c = await generateJson<{ front: string; back: string }>(key, `Turn this passage the reader highlighted in "${book}" into one flashcard that tests whether they remember its idea (not its exact words). Passage: """${text.slice(0, 1200)}"""${note ? ` Their note: "${note.slice(0, 300)}".` : ""}\nReply with JSON only: {"front": "a short question", "back": "a short answer"}`);
      if (c?.front && c?.back) return c;
    } catch {}
  }
  return { front: `From “${book}”: what was this passage about?${note ? ` (Your note: ${note})` : ""}`, back: text };
}

const STATUSES: NewsStatus[] = ["Confirmed", "Reported", "Rumour", "Fixture", "Research"];

export function newsPrompt(topic: string, sources: string[], blocked: Block[], day: string): string {
  return [
    `Today is ${day}. Use Google Search to find the 3 to 5 most important news stories about "${topic}" from the last 48 hours.`,
    sources.length ? `Use only these trusted sources: ${sources.join(", ")}. If none has news, return [].` : `Use only official accounts and established outlets with a strong record. No gossip sites, aggregators, fan blogs or content farms.`,
    blocked.length ? `Never include anything matching: ${blocked.map(b => b.value).join("; ")}.` : "",
    `If several outlets report the same story, include it once. Label each story: Confirmed (officially announced), Reported (a credible outlet says so, not yet official), Rumour (unconfirmed), Fixture (a scheduled event), or Research (a study or report).`,
    sources.some(x => /^(https?:\/\/)?(www\.)?(x|twitter)\.com\//i.test(x)) ? `For X accounts, use the account's own recent posts and link the exact post (https://x.com/<account>/status/<id>).` : "",
    `Write each title and summary in your own words; do not copy headlines. The url must be the exact article page or post you used.`,
    `Reply with JSON only: [{"title": "...", "summary": "one or two sentences", "status": "Confirmed|Reported|Rumour|Fixture|Research", "source": "outlet name", "url": "https://...", "date": "YYYY-MM-DD"}]`,
  ].filter(Boolean).join("\n");
}

export function cleanNews(raw: unknown, topic: string, sources: string[]): NewsItem[] {
  const seen = new Set<string>();
  // "x.com/ManUtd" allows only that account's posts; "bbc.co.uk" allows the site and its subdomains.
  const allowed = sources.map(s => s.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/^twitter\.com/, "x.com").replace(/\/+$/, ""));
  return (Array.isArray(raw) ? raw : []).flatMap((n: Partial<NewsItem>) => {
    if (!n || typeof n.title !== "string" || typeof n.url !== "string" || !/^https:\/\//.test(n.url)) return [];
    let host = "";
    try { host = new URL(n.url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return []; }
    const path = new URL(n.url).pathname.toLowerCase();
    if (host === "twitter.com") host = "x.com";
    const ok = (a: string) => {
      const [h, ...rest] = a.split("/"), sub = rest.join("/");
      if (!h.includes(".")) return (n.source ?? "").toLowerCase().includes(a);
      if (!(host === h || host.endsWith("." + h))) return false;
      return !sub || path === "/" + sub || path.startsWith("/" + sub + "/");
    };
    if (allowed.length && !allowed.some(ok)) return [];
    const key = n.title.toLowerCase().replace(/\W+/g, " ").trim().slice(0, 60);
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ id: itemId(n.url), topic, title: n.title.slice(0, 160), summary: String(n.summary ?? "").slice(0, 400), status: STATUSES.includes(n.status as NewsStatus) ? (n.status as NewsStatus) : "Reported", source: String(n.source ?? host).slice(0, 60), url: n.url, date: typeof n.date === "string" ? n.date.slice(0, 10) : undefined }];
  }).slice(0, 5);
}

/** What the AI is told about where to watch: free and legal first, with a trailer for a picture. */
export const WATCH_RULES = `Put titles people can watch FREE and legally first (at least half of the picks when possible): a full film or episodes posted by the rights-holder on their official YouTube channel, free broadcaster services (BBC iPlayer, ARTE, TV5MONDE, RTVE Play, ZDF Mediathek, NHK World), free ad-supported services (Tubi, Pluto TV, Plex, YouTube Movies free with ads), library services (Kanopy, Hoopla) or public-domain archives (Internet Archive). Never suggest pirated uploads. For each title give "free": true or false, "watch": the exact page or YouTube video URL where it can be watched free (null if it isn't free), and "trailer": the URL of its official trailer on YouTube (null if you can't find one).`;

const yt = (u: unknown) => typeof u === "string" && /^https:\/\/(www\.|m\.)?(youtube\.com\/(watch\?v=|embed\/|shorts\/)|youtu\.be\/)[A-Za-z0-9_-]{11}/.test(u) ? u : undefined;
const https = (u: unknown) => typeof u === "string" && /^https:\/\//.test(u) ? u : undefined;
/** The watch fields of a raw AI pick. */
function watchFields(r: Record<string, unknown>): Pick<UnwindPick, "watch" | "free" | "trailer"> {
  const watch = https(r.watch);
  return { ...(watch ? { watch } : {}), free: !!watch && r.free !== false, ...(yt(r.trailer) ? { trailer: yt(r.trailer) } : {}) };
}

export type VerifyFn = (urls: string[]) => Promise<({ url: string; thumb?: string; platform?: string } | null)[]>;
export const verifyUrls: VerifyFn = async urls => {
  if (!urls.length) return [];
  const r = await fetch("/api/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: urls.map(url => ({ url, kind: "video" })) }) });
  if (!r.ok) return urls.map(() => null);
  return ((await r.json()).items ?? []) as ({ url: string; thumb?: string; platform?: string } | null)[];
};

/**
 * Checks each pick's free link and trailer (dropping any that don't exist), gives it a picture
 * (the free video's, the trailer's, or its page's), and puts the ones you can watch free first.
 */
export async function enrichPicks(picks: UnwindPick[], check: VerifyFn = verifyUrls): Promise<UnwindPick[]> {
  const urls = [...new Set(picks.flatMap(p => [p.watch, p.trailer, p.url].filter((u): u is string => !!u)))].slice(0, 40);
  let results: Map<string, { thumb?: string; platform?: string } | null>;
  try { const r = await check(urls); results = new Map(urls.map((u, i) => [u, r[i] ?? null])); }
  catch { return picks; }
  const out = picks.map(p => {
    const w = p.watch ? results.get(p.watch) : undefined, t = p.trailer ? results.get(p.trailer) : undefined, page = results.get(p.url);
    const watch = p.watch && w !== null ? p.watch : undefined;
    const trailer = p.trailer && t !== null ? p.trailer : undefined;
    const thumb = (watch && w?.thumb) || (trailer && t?.thumb) || page?.thumb || p.thumb;
    return { ...p, watch, free: !!watch && !!p.free, trailer, ...(thumb ? { thumb } : {}) };
  });
  return out.sort((a, b) => Number(!!b.free) - Number(!!a.free));
}

export async function unwindPicks(key: string, p: Profile, avoid: string[], n = 4): Promise<UnwindPick[]> {
  const areas = p.areas.filter(a => a.freq !== "Paused").map(a => a.name);
  const raw = await generateJson<Partial<UnwindPick>[]>(key, [
    `Suggest ${n} TV series, films or documentaries to watch for relaxation this weekend. Fun first, with something quietly useful inside that links to one of these areas: ${areas.join(", ")}. ${goal(p)}`,
    avoid.length ? `Don't suggest: ${avoid.slice(-40).join("; ")}.` : "",
    `Use Google Search to confirm each title exists. Give the official site or a reliable reference page (for example Wikipedia) as the url, and the most common place to stream it, noting it varies by country.`,
    WATCH_RULES,
    `Reply with JSON only: [{"title": "...", "kind": "series|film|documentary", "year": "YYYY", "why": "one sentence on why it's fun and what it quietly teaches", "area": "one of the areas above", "where": "e.g. Free on Tubi, or Netflix (varies by country)", "url": "https://...", "free": true, "watch": "https://... or null", "trailer": "https://www.youtube.com/watch?v=... or null"}]`,
  ].filter(Boolean).join("\n"), { search: true });
  const picks = (Array.isArray(raw) ? raw : []).flatMap(r => (r && typeof r.title === "string" && typeof r.url === "string" && /^https:\/\//.test(r.url))
    ? [{ id: itemId(r.title.toLowerCase()), title: r.title, kind: (["series", "film", "documentary"].includes(r.kind as string) ? r.kind : "series") as UnwindPick["kind"], year: r.year ? String(r.year).slice(0, 4) : undefined, why: String(r.why ?? "").slice(0, 240), area: r.area, where: r.where ? String(r.where).slice(0, 80) : undefined, url: r.url, ...watchFields(r as Record<string, unknown>) }]
    : []).slice(0, n);
  return enrichPicks(picks);
}

/**
 * Films and series that help with the languages you're learning: made in that language (not dubbed),
 * at a level you can follow, with a tip on how to watch them to learn.
 */
export function languageFilmPrompt(langs: { name: string; level?: string }[], avoid: string[], perLanguage = 3): string {
  return [
    `Suggest ${perLanguage} films or TV series for each of these languages, for someone learning them: ${langs.map(l => `${l.name}${l.level ? ` (level: ${l.level})` : ""}`).join(", ")}.`,
    `Each must be originally made in that language (not dubbed), enjoyable, and good for learning: clear everyday speech, a story easy enough to follow at the learner's level (start gentle: comedies, family dramas, slice-of-life, kids' and teen shows for beginners; faster or more regional speech for advanced learners). Mix well-loved classics with recent titles. For English as a learned language, prefer clearly spoken British or American shows.`,
    avoid.length ? `Don't suggest: ${avoid.slice(-40).join("; ")}.` : "",
    `Use Google Search to confirm each title exists. Give the official site or a reliable reference page (for example Wikipedia) as the url, and the most common place to stream it, noting it varies by country.`,
    WATCH_RULES + " For language learners, free broadcaster sites of that language's countries (TV5MONDE for French, RTVE Play for Spanish, ARTE for French and German, NHK World for Japanese) and official YouTube channels of that country's studios and TV stations are especially good.",
    `Reply with JSON only: [{"lang": "the language", "title": "original title (English title)", "kind": "series|film|documentary", "year": "YYYY", "level": "beginner|intermediate|advanced", "why": "one sentence: why it's good for learning this language", "tip": "one practical sentence on how to watch it to learn (e.g. which subtitles, which episodes, what to listen for)", "where": "e.g. Free on TV5MONDE, or Netflix (varies by country)", "url": "https://...", "free": true, "watch": "https://... or null", "trailer": "https://www.youtube.com/watch?v=... or null"}]`,
  ].filter(Boolean).join("\n");
}

export function toLanguagePicks(raw: unknown, langs: string[], perLanguage = 3): UnwindPick[] {
  const known = new Map(langs.map(l => [l.toLowerCase(), l]));
  const count = new Map<string, number>();
  return (Array.isArray(raw) ? raw : []).flatMap((r: Record<string, unknown>) => {
    if (!r || typeof r.title !== "string" || typeof r.url !== "string" || !/^https:\/\//.test(r.url)) return [];
    const lang = known.get(String(r.lang ?? "").toLowerCase().trim()) ?? langs.find(l => String(r.lang ?? "").toLowerCase().includes(l.toLowerCase()));
    if (!lang) return [];
    const n = count.get(lang) ?? 0;
    if (n >= perLanguage) return [];
    count.set(lang, n + 1);
    return [{
      id: itemId(("lang:" + r.title).toLowerCase()), title: r.title.slice(0, 160), kind: (["series", "film", "documentary"].includes(r.kind as string) ? r.kind : "film") as UnwindPick["kind"],
      year: r.year ? String(r.year).slice(0, 4) : undefined, why: String(r.why ?? "").slice(0, 240), area: lang, lang,
      level: ["beginner", "intermediate", "advanced"].includes(String(r.level)) ? String(r.level) : undefined,
      tip: r.tip ? String(r.tip).slice(0, 240) : undefined, where: r.where ? String(r.where).slice(0, 80) : undefined, url: r.url,
      ...watchFields(r),
    }];
  });
}

export async function languageFilmPicks(key: string, langs: { name: string; level?: string }[], avoid: string[], perLanguage = 3): Promise<UnwindPick[]> {
  if (!langs.length) return [];
  const raw = await generateJson<unknown>(key, languageFilmPrompt(langs, avoid, perLanguage), { search: true });
  return enrichPicks(toLanguagePicks(raw, langs.map(l => l.name), perLanguage));
}

/** Unwind picks show on Friday to Sunday, or after a 7-day streak. */
export function unwindTime(d: Date, streak: number): boolean {
  return d.getDay() === 5 || d.getDay() === 6 || d.getDay() === 0 || (streak > 0 && streak % 7 === 0);
}

/** "2026-W46": the ISO week, so picks stay the same all weekend. */
export function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear(), w = Math.ceil(((+t - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7);
  return `${y}-W${String(w).padStart(2, "0")}`;
}
