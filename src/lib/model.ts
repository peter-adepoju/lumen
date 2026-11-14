// Lumen's data model. Everything here is saved in the user's own Google Drive
// (Lumen folder) with a working copy on the device.

export type Category = "skill" | "lang" | "career" | "mind" | "interest" | "news";
export type Freq = "Daily" | "Weekly" | "Sometimes" | "Paused";
export type PlanMode = "Lumen plans each day" | "Same focus every day" | "I choose each day";
export type Format = "Videos" | "Short clips" | "Podcasts" | "Books" | "Articles" | "Exercises and games";

/** `from`: how it got here: chosen at setup, added by you later, or noticed by Lumen and added with your yes. */
export interface Area { id: string; name: string; cat: Category; freq: Freq; star: boolean; from?: "setup" | "you" | "noticed" }

export interface Profile {
  goal: string;
  formats: Format[];
  minutes: number;
  planMode: PlanMode;
  areas: Area[];
  steps: Record<SessionPart, boolean>;
  createdAt: number;
  /** A daily reminder at a local clock time, e.g. "19:00". */
  reminder?: { on: boolean; time: string };
  /** How well you speak each language you're learning (by area id), for film suggestions. */
  langLevels?: Record<string, "beginner" | "intermediate" | "advanced">;
}

export type SessionPart = "Warm-up" | "Learn" | "Practise" | "Reflect" | "News brief" | "Today's reading" | "Unwind picks" | "Games";

export interface AiSettings { mode: "own" | "none"; key?: string; connectedAt?: number }

export type BlockType = "item" | "creator" | "topic" | "platform";
export interface Block { type: BlockType; value: string; reason?: string; at: number }

export interface Added { url: string; source: string; area: string; why?: string; creator?: string; title?: string; at: number }

/** What a recommendation is. "clip" covers short videos from YouTube Shorts, TikTok, Instagram and so on. */
export type ItemKind = "video" | "playlist" | "clip" | "podcast" | "book" | "article" | "course";
export const KIND_LABEL: Record<ItemKind, string> = { video: "Video", playlist: "Playlist", clip: "Short clip", podcast: "Podcast", book: "Book", article: "Article", course: "Course" };

/** A checked, real piece of content Lumen recommends. */
export interface Item {
  id: string;            // stable: derived from the canonical URL
  kind: ItemKind;
  url: string;           // canonical link
  title: string;
  creator: string;
  platform: string;      // "YouTube", "TikTok", "Open Library", "Apple Podcasts", a site name…
  thumb?: string;
  embed?: string;        // an embeddable player address, when the platform offers one
  minutes?: number;
  why?: string;          // one line on why it fits this person
  notice?: string;       // a "what to notice" prompt
  area: string;          // area id it was picked for
}

/** One day's picks for one area. Kept so picks don't change every time Learn opens. */
export interface PickSet { area: string; day: string; items: Item[]; at: number }

export type Rating = "up" | "down" | "too easy" | "too hard" | "done";
export interface Feedback { id: string; title: string; creator: string; platform: string; area: string; rating: Rating; at: number }

/** Where the person stopped in each item: seconds for video/audio, a fraction for articles, a page for books. */
export interface Progress { seconds?: number; duration?: number; index?: number; fraction?: number; done?: boolean; at: number; video?: string; watched?: string[] }

export interface JournalEntry { day: string; area: string; text: string; at: number }

export interface SessionRecord { day: string; area: string; steps: string[]; minutes: number; lumens: number; at: number }

export interface Stats { streak: number; best: number; lastDay: string | null; lumens: number; sessions: SessionRecord[] }

/* ---------- Books ---------- */
/**
 * One real PDF page: its size in PDF points, and its words with their boxes
 * ([text, x, y from the top, width, height]) for selecting and highlighting.
 */
export interface FixedPage { w: number; h: number; n: number; items: [string, number, number, number, number][] }
/** In a fixed-layout book (a PDF), paras[i] is the text of pages[i], in the same order as its items. */
export interface BookChapter { title: string; sub?: string; paras: string[]; pages?: FixedPage[] }
/** The book's own look, from its publisher's stylesheet. Empty when it has none (Lumen's paper is used). */
export interface BookLook { bg?: string; fg?: string; image?: string }
/** A book in Lumen's reading format: plain paragraphs in chapters. Saved in the user's Drive as Books/<id>.json. */
export interface BookDoc {
  id: string; title: string; author: string; note?: string; chapters: BookChapter[];
  /** "fixed": show the real pages (PDFs). Otherwise text flows into Lumen's pages. */
  layout?: "fixed";
  look?: BookLook;
}
export type Shelf = "active" | "reserve" | "finished";
export interface LibraryEntry {
  id: string; title: string; author: string;
  source: "upload" | "gutenberg"; format: "epub" | "pdf" | "text";
  cover?: string;          // a small data: image, or a public cover address
  file?: string;           // the original upload, in the user's Drive (Books/<id>.epub)
  gutenbergId?: number;
  shelf: Shelf; words: number; addedAt: number; lastReadAt?: number;
  at?: { page: number; total: number; pct: number; chapter: string };
}
/**
 * A highlight. In text books it's a range (s to e) of paragraph p in chapter ch.
 * In PDFs it's boxes on page `page`, each [x, y, width, height] as fractions of the page.
 */
export type Highlight = { id: string; group?: string; ch: number; p: number; s: number; e: number; color: string; note: string; text: string; at: number; page: number; rects?: [number, number, number, number][] };
export type PageNote = { id: string; ch: number; p: number; text: string; at: number; page: number };
/** Where the reader is in one book, and everything they marked in it. */
export interface ReadingState {
  ch: number; p: number; hl: Highlight[]; notes: PageNote[]; bookmarks: { id: string; ch: number; p: number; at: number; text: string }[];
  day: string | null; todayFrom: number | null; readToday: number[];
  at?: { page: number; total: number; pct: number; chapter: string };
}
export type ReaderSettings = Record<string, string | number | boolean>;

/* ---------- Practice ---------- */
export type Grade = "again" | "hard" | "good" | "easy";
/** A flashcard with its spaced-repetition schedule. `due` is a day like "2026-11-12". */
export interface Card { id: string; area: string; front: string; back: string; source?: string; due: string; interval: number; ease: number; reps: number; lapses: number; created: number }
export type DrillKind = "digit-span" | "odd-one-out" | "quiz";
export interface DrillScore { kind: DrillKind; area?: string; score: number; out?: number; day: string; at: number }

/* ---------- Games ---------- */
export interface GameScore { kind: "pairs" | "target"; score: number; day: string; at: number }

/* ---------- News and Unwind ---------- */
export type NewsStatus = "Confirmed" | "Reported" | "Rumour" | "Fixture" | "Research";
/** `fresh`: arrived with your latest refresh (it wasn't in the brief you had before). */
export interface NewsItem { id: string; topic: string; title: string; summary: string; status: NewsStatus; source: string; url: string; date?: string; fresh?: boolean; sourceUrl?: string }
/** A news video from a YouTube channel (an outlet's, a club's, a league's). */
export interface NewsVideo { id: string; title: string; channel: string; date: string; thumb: string; url: string }
/** `videoChannels`: the YouTube channels the videos came from (yours, or suggested for the topic). */
export interface NewsSet { topic: string; day: string; items: NewsItem[]; at: number; videos?: NewsVideo[]; videoChannels?: string[] }
/** `lang`, `level` and `tip` are set on picks chosen to help with a language you're learning. */
/**
 * `watch`: where to watch it free and legally (a full film on its official YouTube channel, a free
 * broadcaster or library service), checked; `free` when that's free; `trailer`: its official trailer
 * on YouTube; `thumb`: a picture for it (from the free video or the trailer).
 */
export interface UnwindPick { id: string; title: string; kind: "series" | "film" | "documentary"; year?: string; why: string; area?: string; where?: string; url: string; lang?: string; level?: string; tip?: string; watch?: string; free?: boolean; trailer?: string; thumb?: string }
/** `language`: films and series in the languages you're learning, chosen with the week's picks. */
export interface UnwindSet { week: string; items: UnwindPick[]; at: number; language?: UnwindPick[]; made?: boolean }

/* ---------- Saved, activity and interests Lumen notices ---------- */
/** A link you saved (like Selah's Saved): videos and podcasts play inside Lumen, articles open. */
export interface SavedLink {
  id: string; url: string; title: string; kind: ItemKind; platform: string; creator?: string; thumb?: string; embed?: string;
  folder: string; note?: string; tags: string[]; savedAt: number; done?: boolean; from?: "you" | "share" | "selah";
  /** For a YouTube playlist: its episodes oldest first, when they were last checked, and ones that arrived since you last looked. */
  episodes?: Episode[]; checkedAt?: number; newIds?: string[]; newestFirst?: boolean;
}
export interface Episode { id: string; title: string; seconds?: number; date?: string; approx?: boolean }
/** One thing you did that says something about what interests you. Kept on your Drive, never sent anywhere but your own AI. */
export interface Activity { kind: "save" | "like" | "dislike" | "search" | "finish" | "add"; text: string; area?: string; at: number }
/** An interest Lumen noticed in your activity and asked you about. */
export interface InterestSuggestion { id: string; name: string; cat: Category; why: string; evidence: string[]; at: number; status: "open" | "added" | "later" | "no"; until?: number }
export interface InterestsState { lastRun: number; lastCount: number; suggestions: InterestSuggestion[] }

/** Every document Lumen stores, by name. Each is one JSON file in the user's Lumen folder. */
export interface Docs {
  profile: Profile;
  ai: AiSettings;
  blocked: Block[];
  added: Added[];
  picks: PickSet[];
  feedback: Feedback[];
  progress: Record<string, Progress>;
  journal: JournalEntry[];
  stats: Stats;
  library: LibraryEntry[];
  reading: Record<string, ReadingState>;
  readerSettings: ReaderSettings;
  cards: Card[];
  drills: DrillScore[];
  news: NewsSet[];
  newsSources: Record<string, string[]>;
  unwind: UnwindSet[];
  games: GameScore[];
  saved: SavedLink[];
  activity: Activity[];
  interests: InterestsState;
}
export type DocName = keyof Docs;

export const CATEGORY_NAME: Record<Category, string> = {
  skill: "Skill", lang: "Language", career: "Career", mind: "Mind and habits", interest: "Interest", news: "News",
};

export const AREA_LIBRARY: [Category, string, string[]][] = [
  ["skill", "Skills", ["Communication", "Public speaking", "Presentation", "Writing", "Critical thinking", "Problem solving", "Leadership", "Management", "Negotiation", "Storytelling", "Sales"]],
  ["lang", "Languages", ["English", "Advanced English", "French", "Spanish", "German", "Chinese", "Arabic", "Portuguese", "Japanese", "Yoruba", "Igbo", "Hausa", "Swahili"]],
  ["career", "Career and tech", ["Coding", "Data analysis", "AI tools", "Design", "Product management", "Marketing", "Personal finance", "Investing", "Entrepreneurship", "Project management"]],
  ["mind", "Mind and habits", ["Focus", "Memory", "Confidence", "Presence", "Discipline", "Consistency", "Organization", "Attention to detail", "Processing speed", "Mindfulness", "Sleep", "Fitness"]],
  ["interest", "Interests", ["General knowledge", "History", "Science", "Philosophy", "Chess", "Music", "Art", "Cooking", "Faith and scripture", "Parenting"]],
  ["news", "News to follow", ["Manchester United", "Arsenal", "Real Madrid", "NBA", "Formula 1", "Tech news", "AI news", "Business news", "Science news", "World news"]],
];

export const FORMATS: Format[] = ["Videos", "Short clips", "Podcasts", "Books", "Articles", "Exercises and games"];
export const PLAN_MODES: { mode: PlanMode; hint: string }[] = [
  { mode: "Lumen plans each day", hint: "Rotates through your areas, weighted by your goals and weak spots" },
  { mode: "Same focus every day", hint: "Best for one big goal, like an exam" },
  { mode: "I choose each day", hint: "A short menu every morning; Lumen still suggests one" },
];
export const SESSION_PARTS: SessionPart[] = ["Warm-up", "Learn", "Practise", "Reflect", "News brief", "Today's reading", "Unwind picks", "Games"];

export function slug(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "area";
}

export function makeArea(name: string, cat: Category, star = false): Area {
  return { id: slug(name), name: name.trim(), cat, freq: cat === "lang" || cat === "news" ? "Daily" : "Weekly", star };
}

export function defaultProfile(areas: Area[] = []): Profile {
  return {
    goal: "",
    formats: ["Videos", "Short clips", "Podcasts", "Books", "Exercises and games"],
    minutes: 20,
    planMode: "Lumen plans each day",
    areas,
    steps: Object.fromEntries(SESSION_PARTS.map(p => [p, true])) as Record<SessionPart, boolean>,
    createdAt: Date.now(),
  };
}
