// Recommendations: the person's own Gemini key (with Google Search) suggests
// specific, real items; Lumen's link checker confirms each one; anything the
// person blocked or rated down is dropped. Runs on the device.
import type { Added, Area, Block, Docs, Feedback, Format, Item, ItemKind, PickSet, Profile, SavedLink } from "./model";
import { generateJson } from "./gemini";

export interface Suggestion { kind: ItemKind; title: string; creator?: string; url?: string; why?: string; notice?: string; minutes?: number }

const FORMAT_KINDS: Record<Format, ItemKind[]> = {
  Videos: ["video", "playlist", "course"], "Short clips": ["clip"], Podcasts: ["podcast"], Books: ["book"], Articles: ["article"], "Exercises and games": [],
};

export function wantedKinds(formats: Format[]): ItemKind[] {
  const k = new Set<ItemKind>(formats.flatMap(f => FORMAT_KINDS[f]));
  return k.size ? [...k] : ["video", "playlist", "clip", "podcast", "book", "article", "course"];
}

export function today(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The instructions sent to the person's own Gemini. Everything it needs is in the prompt, nothing else is shared. */
export function buildPrompt(p: { area: Area; profile: Profile; blocked: Block[]; feedback: Feedback[]; added: Added[]; exclude: string[]; count: number }): string {
  const kinds = wantedKinds(p.profile.formats);
  const liked = p.feedback.filter(f => f.rating === "up" || f.rating === "done").slice(-12).map(f => `${f.title} (${f.creator}, ${f.platform})`);
  const disliked = p.feedback.filter(f => f.rating === "down").slice(-12).map(f => `${f.title} (${f.creator})`);
  const level = p.feedback.filter(f => f.area === p.area.id && (f.rating === "too easy" || f.rating === "too hard")).slice(-4).map(f => f.rating);
  const own = p.added.filter(a => a.area === p.area.name || a.area === "General").slice(-8).map(a => `${a.url}${a.why ? ` (${a.why})` : ""}`);
  const block = p.blocked.map(b => `${b.type}: ${b.value}`);
  return [
    `You recommend learning content for one person. Area: "${p.area.name}".`,
    p.profile.goal ? `Their goal, in their words: "${p.profile.goal.slice(0, 500)}".` : "",
    `They have ${p.profile.minutes} minutes a day. Formats they like: ${kinds.join(", ")}.`,
    liked.length ? `They finished or liked: ${liked.join("; ")}.` : "",
    disliked.length ? `They disliked (avoid similar): ${disliked.join("; ")}.` : "",
    level.length ? `Recent level feedback for this area: ${level.join(", ")}. Adjust difficulty.` : "",
    own.length ? `They added these themselves, so they trust this kind of source: ${own.join("; ")}.` : "",
    block.length ? `Never suggest anything matching: ${block.join("; ")}.` : "",
    p.exclude.length ? `Already suggested, don't repeat: ${p.exclude.slice(-40).join("; ")}.` : "",
    `Use Google Search to find ${p.count} SPECIFIC, real, high-quality items that exist today, mixing formats from: ${kinds.join(", ")}.`,
    `Prefer reputable creators and sources. Videos and playlists: give the exact youtube.com link. Short clips: an exact YouTube Shorts, TikTok or Instagram Reel link. Podcasts: an exact episode (show name as creator). Books: exact title and author (url optional). Articles and courses: the exact page link.`,
    `Only include items you found with search or are certain exist. No search-result pages, no channel home pages, nothing paywalled where avoidable.`,
    `Reply with JSON only: [{"kind": one of ${JSON.stringify(kinds)}, "title": "...", "creator": "...", "url": "...", "minutes": number or null, "why": "one short sentence, addressed to the person, on why this fits them", "notice": "one short question about what to notice"}]`,
  ].filter(Boolean).join("\n");
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** True if a checked item matches anything the person blocked. */
export function blockedBy(item: Pick<Item, "title" | "creator" | "platform">, area: Area, blocked: Block[]): Block | null {
  for (const b of blocked) {
    const v = norm(b.value);
    if (!v) continue;
    if (b.type === "item" && norm(item.title) === v) return b;
    if (b.type === "creator" && norm(item.creator) === v) return b;
    if (b.type === "platform" && norm(item.platform) === v) return b;
    if (b.type === "topic" && (norm(area.name) === v || norm(item.title).includes(v) || norm(item.creator).includes(v))) return b;
  }
  return null;
}

/** Keeps the checked items worth showing: not blocked, not rated down, no duplicates. */
export function keep(items: Item[], area: Area, blocked: Block[], feedback: Feedback[]): Item[] {
  const down = new Set(feedback.filter(f => f.rating === "down").map(f => f.id));
  const seen = new Set<string>();
  return items.filter(it => {
    if (seen.has(it.id) || down.has(it.id) || blockedBy(it, area, blocked)) return false;
    seen.add(it.id);
    return true;
  });
}

export type Checker = (cands: Suggestion[]) => Promise<(Omit<Item, "area" | "why" | "notice"> | null)[]>;

export const checkLinks: Checker = async cands => {
  const res = await fetch("/api/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: cands.map(c => ({ url: c.url, kind: c.kind, title: c.title, creator: c.creator })) }) });
  if (!res.ok) throw new Error(res.status === 429 ? "slow_down" : "verify_failed");
  return (await res.json()).items;
};

/** Saved links that belong to an area (by folder, tag or title), as things the person chose themselves. */
export function savedFor(area: Area, saved: SavedLink[] | undefined): Added[] {
  const words = area.name.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  return (saved ?? []).filter(s => {
    const hay = `${s.folder} ${s.tags.join(" ")} ${s.title}`.toLowerCase();
    return words.length > 0 && words.every(w => hay.includes(w));
  }).slice(0, 8).map(s => ({ url: s.url, source: s.platform, area: area.name, title: s.title, creator: s.creator, why: s.note?.slice(0, 120), at: s.savedAt }));
}

/** Finds today's picks for one area. */
export async function findPicks(args: { key: string; area: Area; docs: Partial<Docs>; count?: number; check?: Checker; ask?: typeof generateJson }): Promise<Item[]> {
  const { key, area, docs } = args;
  const ask = args.ask ?? generateJson, check = args.check ?? checkLinks;
  const exclude = (docs.picks ?? []).filter(s => s.area === area.id).flatMap(s => s.items.map(i => i.title));
  const prompt = buildPrompt({ area, profile: docs.profile!, blocked: docs.blocked ?? [], feedback: docs.feedback ?? [], added: [...(docs.added ?? []), ...savedFor(area, docs.saved)], exclude, count: args.count ?? 6 });
  const raw = await ask<Suggestion[]>(key, prompt, { search: true });
  const sugg = (Array.isArray(raw) ? raw : []).filter(s => s && typeof s.title === "string").slice(0, 10);
  const checked = await check(sugg);
  const items: Item[] = [];
  checked.forEach((c, i) => {
    if (!c) return;
    const s = sugg[i];
    items.push({ ...c, minutes: c.minutes ?? (typeof s.minutes === "number" ? s.minutes : undefined), why: s.why?.slice(0, 200), notice: s.notice?.slice(0, 200), area: area.id });
  });
  return keep(items, area, docs.blocked ?? [], docs.feedback ?? []);
}

/** Today's saved picks for an area, if any. */
export function picksFor(sets: PickSet[] | undefined, areaId: string, day = today()): PickSet | undefined {
  return sets?.find(s => s.area === areaId && s.day === day);
}

/** Adds or replaces a day's picks, keeping the last 60 sets. */
export function savePickSet(sets: PickSet[] | undefined, set: PickSet): PickSet[] {
  return [...(sets ?? []).filter(s => !(s.area === set.area && s.day === set.day)), set].slice(-60);
}
