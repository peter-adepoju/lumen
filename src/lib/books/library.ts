"use client";
// The user's library. Each book is kept in Lumen's reading format on the device
// (for offline reading) and, when signed in, in the Books folder of their Drive,
// next to the original file they uploaded.
import type { BookDoc, LibraryEntry, Shelf } from "../model";
import { idb } from "../store/idb";
import { store } from "../store/store";
import { itemId } from "../links";
import { wordCount } from "./text";

const MAX_UPLOAD = 60 * 1024 * 1024;

async function shrinkCover(img: Blob): Promise<string | undefined> {
  try {
    const bmp = await createImageBitmap(img), h = 240, w = Math.round((bmp.width / bmp.height) * h);
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    c.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
    return c.toDataURL("image/jpeg", 0.78);
  } catch { return undefined; }
}

async function saveBook(doc: BookDoc, entry: Omit<LibraryEntry, "shelf" | "addedAt">, original?: { blob: Blob; ext: string; mime: string }) {
  await idb.set("book:" + doc.id, doc);
  const drive = store.driveClient();
  if (drive) {
    await drive.writeJson(`Books/${doc.id}.json`, doc);
    if (original) await drive.write(`Books/${doc.id}.${original.ext}`, original.blob, original.mime);
  }
  const lib = store.get("library") ?? [];
  const shelf: Shelf = lib.some(b => b.shelf === "active") ? "reserve" : "active";
  await store.set("library", [{ ...entry, shelf, addedAt: Date.now() }, ...lib.filter(b => b.id !== doc.id)]);
}

export class ImportError extends Error {}

/** Adds an EPUB or PDF the person owns. */
export async function importFile(file: File, onStep?: (s: string) => void): Promise<LibraryEntry> {
  const ext = file.name.toLowerCase().split(".").pop();
  if (file.size > MAX_UPLOAD) throw new ImportError("That file is over 60 MB. Try a smaller edition.");
  onStep?.("Reading the book…");
  let parsed: { title: string; author: string; chapters: BookDoc["chapters"]; cover?: Blob };
  try {
    if (ext === "epub") parsed = await (await import("./epub")).parseEpub(file);
    else if (ext === "pdf") parsed = await (await import("./pdf")).parsePdf(await file.arrayBuffer());
    else throw new ImportError("Lumen reads EPUB and PDF files.");
  } catch (e) {
    if (e instanceof ImportError) throw e;
    const m = (e as Error).message;
    throw new ImportError(m === "scanned" ? "This PDF is scanned pictures of pages, so there's no text to read. Try an EPUB or a text-based PDF." : m === "no_text" || m === "not_epub" ? "Lumen couldn't find the text in this file. It may be damaged or protected (DRM)." : "Lumen couldn't open this file. It may be damaged or protected (DRM).");
  }
  const title = parsed.title || file.name.replace(/\.(epub|pdf)$/i, "");
  const id = "b" + itemId(`${title}|${parsed.author}|${file.size}`).slice(1);
  const doc: BookDoc = { id, title, author: parsed.author || "Unknown author", chapters: parsed.chapters };
  onStep?.(store.mode === "google" ? "Saving to your Drive…" : "Saving on this device…");
  await saveBook(doc, { id, title, author: doc.author, source: "upload", format: ext as "epub" | "pdf", cover: parsed.cover ? await shrinkCover(parsed.cover) : undefined, file: `Books/${id}.${ext}`, words: wordCount(doc.chapters) },
    { blob: file, ext: ext!, mime: ext === "pdf" ? "application/pdf" : "application/epub+zip" });
  return store.get("library")!.find(b => b.id === id)!;
}

export interface Classic { id: number; title: string; author: string; cover: string }

export async function searchClassics(q: string): Promise<Classic[]> {
  const r = await fetch("/api/books/search?q=" + encodeURIComponent(q));
  if (!r.ok) throw new ImportError("Couldn't reach Project Gutenberg. Try again in a moment.");
  return (await r.json()).items;
}

/** Downloads a free public-domain book from Project Gutenberg into the library. */
export async function addClassic(c: Classic): Promise<LibraryEntry> {
  const r = await fetch(`/api/books/gutenberg/${c.id}`);
  if (!r.ok) throw new ImportError(r.status === 404 ? "This book has no plain-text edition Lumen can read." : "Couldn't download the book. Try again in a moment.");
  const { words, ...doc } = (await r.json()) as BookDoc & { words: number };
  await saveBook(doc, { id: doc.id, title: doc.title, author: doc.author, source: "gutenberg", format: "text", cover: c.cover, gutenbergId: c.id, words });
  return store.get("library")!.find(b => b.id === doc.id)!;
}

/** Opens a book: from the device first, then from Drive (and keeps a copy for offline). */
export async function loadBook(id: string): Promise<BookDoc | null> {
  const local = await idb.get<BookDoc>("book:" + id);
  if (local) return local;
  const drive = store.driveClient();
  const remote = drive ? await drive.readJson<BookDoc>(`Books/${id}.json`).catch(() => null) : null;
  if (remote) await idb.set("book:" + id, remote);
  return remote;
}

export function moveBook(id: string, shelf: Shelf) {
  return store.update("library", lib => (lib ?? []).map(b => (b.id === id ? { ...b, shelf } : b)));
}

export async function removeBook(id: string) {
  const entry = store.get("library")?.find(b => b.id === id);
  await store.update("library", lib => (lib ?? []).filter(b => b.id !== id));
  await idb.del("book:" + id);
  const drive = store.driveClient();
  if (drive) { await drive.remove(`Books/${id}.json`).catch(() => {}); if (entry?.file) await drive.remove(entry.file).catch(() => {}); }
}

/** Today's reading: the next few pages of a book on the "Currently reading" shelf, taking turns between books. */
export function todaysBook(lib: LibraryEntry[] | undefined, day: string): LibraryEntry | null {
  const active = (lib ?? []).filter(b => b.shelf === "active" && !(b.at && b.at.page >= b.at.total));
  const pool = active.length ? active : (lib ?? []).filter(b => b.shelf === "reserve");
  if (!pool.length) return null;
  const sorted = [...pool].sort((a, b) => a.addedAt - b.addedAt || a.id.localeCompare(b.id));
  const n = Math.floor(Date.parse(day + "T12:00:00Z") / 864e5);
  return sorted[n % sorted.length];
}
