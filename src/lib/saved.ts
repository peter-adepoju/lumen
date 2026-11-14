// Saved: links you keep, like Selah's Saved. Videos and podcasts play inside Lumen; everything you
// save also tells your own AI a little more about what interests you.

import type { ItemKind, SavedLink } from "./model";
import { classify, itemId } from "./links";

export const INBOX = "Unsorted";

export interface Checked { title?: string; creator?: string; platform?: string; thumb?: string; kind?: ItemKind; url?: string; embed?: string }

/** A saved link from what you pasted and what Lumen could find out about it. */
export function makeSaved(url: string, info: Checked | null, extra: Partial<SavedLink> = {}, now = Date.now()): SavedLink | null {
  const c = classify(url.trim());
  if (!c) return null;
  const canonical = info?.url && classify(info.url) ? classify(info.url)!.canonical : c.canonical;
  return {
    id: itemId(canonical), url: canonical, title: (info?.title || extra.title || hostTitle(canonical)).slice(0, 200), kind: info?.kind ?? c.kind,
    platform: info?.platform ?? c.platform, ...(info?.creator ? { creator: info.creator.slice(0, 80) } : {}), ...(info?.thumb ? { thumb: info.thumb } : {}), ...(info?.embed ? { embed: info.embed } : {}),
    folder: INBOX, tags: [], savedAt: now, from: "you", ...extra,
  };
}

function hostTitle(u: string): string { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } }

/** Puts a new save at the top, replacing an older save of the same link (its folder, note and tags are kept). */
export function upsertSaved(list: SavedLink[] | undefined, s: SavedLink): SavedLink[] {
  const prev = (list ?? []).find(x => x.id === s.id);
  const merged = prev ? { ...s, folder: prev.folder !== INBOX ? prev.folder : s.folder, note: s.note || prev.note, tags: [...new Set([...prev.tags, ...s.tags])], savedAt: prev.savedAt, done: prev.done } : s;
  return [merged, ...(list ?? []).filter(x => x.id !== s.id)].slice(0, 2000);
}

export function folders(list: SavedLink[]): string[] {
  return [...new Set([INBOX, ...list.map(s => s.folder)])].sort((a, b) => (a === INBOX ? -1 : b === INBOX ? 1 : a.localeCompare(b)));
}

export function matches(s: SavedLink, q: string): boolean {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hay = `${s.title} ${s.creator ?? ""} ${s.platform} ${s.note ?? ""} ${s.tags.join(" ")} ${s.folder} ${s.url}`.toLowerCase();
  return words.every(w => hay.includes(w));
}

export const tagList = (s: string) => [...new Set(s.split(/[,#]/).map(t => t.trim().toLowerCase().replace(/\s+/g, "-")).filter(Boolean))].slice(0, 12);

/** A shared page arrives as title / text / url; the link is sometimes inside the text. */
export function fromShare(p: { title?: string | null; text?: string | null; url?: string | null }): { url: string; title?: string } | null {
  const url = p.url || p.text?.match(/https?:\/\/\S+/)?.[0];
  if (!url) return null;
  return { url, title: p.title || undefined };
}

// ── Importing Selah's Saved (Selah → Export → Saved → spreadsheet) ─────────
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}

const SELAH_KIND: Record<string, ItemKind> = { video: "video", clip: "clip", article: "article", post: "article", highlight: "article", image: "article", link: "article" };

export function importSelahCsv(text: string, now = Date.now()): SavedLink[] {
  const rows = parseCsv(text.replace(/^﻿/, ""));
  const head = (rows.shift() ?? []).map(h => h.trim().toLowerCase());
  const col = (r: string[], name: string) => r[head.indexOf(name)]?.trim() ?? "";
  if (!head.includes("link")) throw new Error("This doesn't look like Selah's Saved export. In Selah: Export → Saved → spreadsheet (CSV).");
  const out: SavedLink[] = [];
  for (const r of rows) {
    const url = col(r, "link");
    const c = classify(url);
    if (!c) continue;
    const at = Date.parse(col(r, "saved on"));
    out.push({
      id: itemId(c.canonical), url: c.canonical, title: (col(r, "title") || hostTitle(c.canonical)).slice(0, 200), kind: SELAH_KIND[col(r, "type").toLowerCase()] ?? c.kind,
      platform: c.platform, folder: col(r, "section") || INBOX, note: [col(r, "note"), col(r, "summary")].filter(Boolean).join("\n\n") || undefined,
      tags: tagList(col(r, "tags")), savedAt: Number.isNaN(at) ? now : at, from: "selah",
    });
  }
  return out;
}
