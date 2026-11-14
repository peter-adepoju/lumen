// Today's reading as a complete piece: a whole chapter when it fits in your reading time, otherwise
// a section within it (by its subheadings, or by theme with your own AI), so each day ends where an
// idea ends, never in the middle of one. Pure functions; tested in daily.test.ts.

import type { BookDoc, ReadingState } from "../model";

export const WPM = 230; // a comfortable reading speed, words a minute

/** One unit of a book: a paragraph (flowing books) or a page (PDFs). */
export interface Unit { ch: number; i: number; words: number; heading?: string }
/** A place a day's reading may start or stop. */
export interface Boundary { at: number; title: string; kind: "chapter" | "section" | "theme" }
export interface ThemeCut { start: number; title: string; about?: string } // `start`: unit index within the chapter
export interface DailyPlan {
  day: string; start: number; end: number; // units [start, end)
  title: string; about?: string; kind: "chapter" | "chapters" | "section" | "theme" | "part";
  words: number; next?: string;             // where to stop: the next section's title
  takeaways?: string[];
  minutes?: number;                         // the reading time it was planned for
}

const words = (s: string) => (s.match(/\S+/g) ?? []).length;

/** Does this paragraph look like a heading? Short, no ending punctuation, set like a title. */
export function headingOf(p: string): string | null {
  const t = p.replace(/\s+/g, " ").trim();
  if (!t || t.length > 90) return null;
  const w = words(t);
  if (w > 12) return null;
  if (/[.,;:!?"”’)]$/.test(t) && !/^(chapter|part|section)\b/i.test(t)) return null;
  if (/^(chapter|part|section|lesson|book|day)\s+([0-9ivxlc]+|one|two|three|four|five|six|seven|eight|nine|ten)\b/i.test(t)) return t;
  if (/^\d+(\.\d+)*\.?\s+\p{Lu}/u.test(t)) return t;                 // "2.3 Faith and works"
  if (t === t.toUpperCase() && /\p{Lu}{3,}/u.test(t)) return t;     // ALL CAPS
  const caps = t.split(" ").filter(x => /^\p{Lu}/u.test(x)).length;
  if (w >= 2 && caps / w >= 0.6) return t;                           // Title Case
  return null;
}

/** The book as units, with each chapter's first unit and any subheadings. */
export function unitsOf(doc: BookDoc): Unit[] {
  const out: Unit[] = [];
  const fixed = doc.layout === "fixed";
  doc.chapters.forEach((c, ch) => {
    c.paras.forEach((p, i) => {
      // In a PDF a unit is a page: a heading among its first lines starts a section there.
      const lines = fixed ? p.split(/\n+/).slice(0, 3) : [p];
      const h = lines.map(headingOf).find(Boolean) ?? undefined;
      out.push({ ch, i, words: words(p), ...(h ? { heading: h } : {}) });
    });
  });
  return out;
}

/** Where you are, as a unit index: the reader's paragraph (or a PDF's page). */
export function positionOf(doc: BookDoc, st: ReadingState | undefined): number {
  if (!st) return 0;
  if (doc.layout === "fixed") return Math.max(0, st.p);
  let g = 0;
  for (let c = 0; c < Math.min(st.ch, doc.chapters.length); c++) g += doc.chapters[c].paras.length;
  return g + Math.max(0, Math.min(st.p, (doc.chapters[st.ch]?.paras.length ?? 1) - 1));
}

/** True when a PDF's chapters are just every 10 pages (no real structure). */
const madeUp = (t: string) => /^(Pages \d+–\d+|Opening)$/.test(t);

/** Every place a day's reading may stop: chapter starts, subheadings, and themes the AI found. */
export function boundaries(doc: BookDoc, units: Unit[], themes: Record<number, ThemeCut[]> = {}): Boundary[] {
  const out: Boundary[] = [];
  let first = 0;
  doc.chapters.forEach((c, ch) => {
    if (c.paras.length && !madeUp(c.title)) out.push({ at: first, title: c.title || `Chapter ${ch + 1}`, kind: "chapter" });
    for (let k = 1; k < c.paras.length; k++) { const u = units[first + k]; if (u?.heading) out.push({ at: first + k, title: u.heading, kind: "section" }); }
    for (const t of themes[ch] ?? []) if (t.start > 0 && t.start < c.paras.length) out.push({ at: first + t.start, title: t.title, kind: "theme" });
    first += c.paras.length;
  });
  const seen = new Set<number>();
  return out.sort((a, b) => a.at - b.at || (a.kind === "chapter" ? -1 : 1)).filter(b => !seen.has(b.at) && (seen.add(b.at), true));
}

const sum = (units: Unit[], a: number, b: number) => { let n = 0; for (let i = a; i < b && i < units.length; i++) n += units[i].words; return n; };

/**
 * Today's piece, from where you are. Takes whole pieces (chapter, or section) up to your reading
 * time: at least half of it, never more than about one and a half times it unless a single piece is
 * that long. A piece much longer than your time, with nothing to split it by, ends at a paragraph
 * near your time instead ("part").
 */
export function planToday(doc: BookDoc, units: Unit[], bounds: Boundary[], pos: number, minutes: number, day: string): DailyPlan | null {
  const total = units.length;
  if (!total || pos >= total) return null;
  const budget = Math.max(400, minutes * WPM);
  const stops = [...bounds.map(b => b.at).filter(a => a > pos), total];
  const startB = [...bounds].reverse().find(b => b.at <= pos);
  // If you're a little way into a piece, start at its beginning, so the day reads as one whole.
  let start = pos;
  if (startB && pos - startB.at <= 3 && sum(units, startB.at, pos) < budget * 0.15) start = startB.at;

  // Always at least the first whole piece; then whole pieces while they fit, until there's enough.
  // Once a chapter has ended, only whole chapters are added (never the start of the next one).
  const chapterAt = new Set(bounds.filter(b => b.kind === "chapter").map(b => b.at));
  chapterAt.add(total);
  let end = stops[0];
  for (const s of stops) {
    const w = sum(units, start, s);
    if (s !== stops[0]) {
      if (w > budget * 1.5) break;
      if (chapterAt.has(end) && !chapterAt.has(s)) {
        if (sum(units, start, end) >= budget * 0.5) break;
        continue; // look for the end of the next chapter instead
      }
      end = s;
    }
    if (w >= budget * 0.9) break;
  }
  let kind: DailyPlan["kind"];
  const w = sum(units, start, end);
  const chapterStarts = new Set(bounds.filter(b => b.kind === "chapter").map(b => b.at));
  const piecesInside = bounds.filter(b => b.at > start && b.at < end);
  if (w > budget * 2.2 && !piecesInside.length) {
    // One very long piece with nothing inside to split it by: stop at a paragraph near your time.
    let e = start, acc = 0;
    while (e < end && acc < budget) acc += units[e++].words;
    end = Math.max(start + 1, e);
    kind = "part";
  } else if (chapterStarts.has(start) && (chapterStarts.has(end) || end === total)) kind = piecesInside.some(b => b.kind === "chapter") ? "chapters" : "chapter";
  else kind = bounds.find(b => b.at === start)?.kind === "theme" || piecesInside.some(b => b.kind === "theme") ? "theme" : "section";

  const head = [...bounds].reverse().find(b => b.at <= start);
  const firstHere = bounds.find(b => b.at === start);
  const chTitle = doc.chapters[units[start].ch]?.title ?? "";
  const title = kind === "chapters"
    ? `${firstHere?.title ?? chTitle} and ${bounds.filter(b => b.kind === "chapter" && b.at > start && b.at < end).length} more`
    : kind === "part" ? `${head?.title ?? chTitle} (part)` : firstHere?.title ?? (head ? `${head.title} (continued)` : chTitle || "Reading");
  const next = bounds.find(b => b.at === end)?.title;
  return { day, start, end, title, kind, words: sum(units, start, end), ...(next ? { next } : {}) };
}

/** How far into today's piece you are, 0–1, and whether it's done. */
export function planProgress(units: Unit[], plan: DailyPlan, pos: number): { fraction: number; done: boolean } {
  if (pos >= plan.end - 1) return { fraction: 1, done: true }; // the last paragraph is on the page you're on
  if (pos <= plan.start) return { fraction: 0, done: false };
  return { fraction: Math.min(1, sum(units, plan.start, pos) / Math.max(1, plan.words)), done: false };
}

/** Asks the AI to split a long chapter by theme into pieces of about the reading time. */
export function themePrompt(title: string, paras: string[], targetWords: number): string {
  const lines = paras.map((p, i) => `[${i}] ${p.replace(/\s+/g, " ").slice(0, 220)}`).join("\n");
  return [
    `Here is a chapter called "${title}", paragraph by paragraph (each shortened). Split it into consecutive sections, each a complete idea, theme or part of the argument or story, so a reader can finish one and know what they learned.`,
    `Aim for sections of roughly ${targetWords} words (the chapter has about ${paras.reduce((n, p) => n + words(p), 0)}); follow the content over the length. Never start a section in the middle of a thought.`,
    lines,
    `Reply with JSON only: [{"start": paragraph number where the section begins (the first is 0), "title": "a short title for the section", "about": "one sentence on what it teaches or tells"}]`,
  ].join("\n\n");
}

export function toThemeCuts(raw: unknown, paraCount: number): ThemeCut[] {
  const cuts = (Array.isArray(raw) ? raw : []).flatMap((r: Record<string, unknown>) => (r && Number.isInteger(r.start) && Number(r.start) >= 0 && Number(r.start) < paraCount && typeof r.title === "string") ? [{ start: Number(r.start), title: String(r.title).slice(0, 80), ...(r.about ? { about: String(r.about).slice(0, 200) } : {}) }] : []);
  const seen = new Set<number>();
  return cuts.sort((a, b) => a.start - b.start).filter(c => !seen.has(c.start) && (seen.add(c.start), true));
}

/** The text of today's piece, for the AI's key ideas. */
export function planText(doc: BookDoc, units: Unit[], plan: DailyPlan, maxWords = 7000): string {
  const out: string[] = [];
  let n = 0;
  for (let i = plan.start; i < plan.end && n < maxWords; i++) {
    const u = units[i];
    const t = doc.chapters[u.ch]?.paras[u.i] ?? "";
    out.push(t); n += u.words;
  }
  return out.join("\n\n");
}
