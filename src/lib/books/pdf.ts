"use client";
// Reads a PDF the user owns. Lumen shows its real pages, exactly as published, with
// each page's words kept (with their positions) so highlights, notes, search and
// read-aloud work on top of the page. Runs in the browser with pdf.js.
import type { BookChapter, FixedPage } from "../model";

interface TextItem { str: string; transform: number[]; height: number; width?: number; hasEOL?: boolean }

const r1 = (n: number) => Math.round(n * 10) / 10;

/** A page's words with their boxes, measured from the top-left of the page, in reading order. */
export function pageItems(items: TextItem[], pageH: number): FixedPage["items"] {
  return items.filter(it => it.str && it.str.trim()).map(it => {
    const h = Math.abs(it.height || it.transform[3] || 10);
    return [it.str, r1(it.transform[4]), r1(pageH - it.transform[5] - h), r1(it.width ?? it.str.length * h * 0.5), r1(h)] as [string, number, number, number, number];
  });
}

/** The page's text as Lumen stores it: each word box's text, separated by single spaces. */
export function pageText(items: FixedPage["items"]): string {
  return items.map((it, k) => it[0] + (k < items.length - 1 ? " " : "")).join("");
}

/** Groups a page's text pieces into lines, then lines into paragraphs by the gaps between them. */
export function pageParagraphs(items: TextItem[]): string[] {
  const rows: { y: number; h: number; text: string }[] = [];
  for (const it of items) {
    if (!it.str.trim() && !it.hasEOL) continue;
    const y = it.transform[5], h = Math.abs(it.height || it.transform[3] || 10);
    const row = rows.find(r => Math.abs(r.y - y) < h * 0.4);
    if (row) row.text += (row.text.endsWith(" ") || it.str.startsWith(" ") ? "" : " ") + it.str;
    else rows.push({ y, h, text: it.str });
  }
  rows.sort((a, b) => b.y - a.y);
  const paras: string[] = [];
  let cur = "", prev: { y: number; h: number } | null = null;
  const gaps = rows.slice(1).map((r, i) => rows[i].y - r.y).filter(g => g > 0).sort((a, b) => a - b);
  const normal = gaps[Math.floor(gaps.length / 4)] ?? 14; // the usual line gap: most gaps are between lines, not paragraphs
  for (const r of rows) {
    const t = r.text.replace(/\s+/g, " ").trim();
    if (!t || /^\d{1,4}$/.test(t)) { prev = r; continue; } // skip page numbers
    const gap = prev ? prev.y - r.y : 0;
    if (prev && gap > normal * 1.45 && cur) { paras.push(cur); cur = ""; }
    cur = cur ? (cur.endsWith("-") ? cur.slice(0, -1) + t : cur + " " + t) : t;
    prev = r;
  }
  if (cur) paras.push(cur);
  return paras;
}

export async function parsePdf(data: ArrayBuffer): Promise<{ title: string; author: string; chapters: BookChapter[]; pages: number; cover?: Blob; layout: "fixed" }> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(data), cMapUrl: "/pdfjs/cmaps/", cMapPacked: true, standardFontDataUrl: "/pdfjs/standard_fonts/" }).promise;
  const info = ((await pdf.getMetadata().catch(() => null))?.info ?? {}) as { Title?: string; Author?: string };

  const pages: FixedPage[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    pages.push({ w: r1(vp.width), h: r1(vp.height), n: i, items: pageItems(tc.items as TextItem[], vp.height) });
  }

  // Chapters from the PDF's own bookmarks when it has them; otherwise every 10 pages.
  const starts: { page: number; title: string }[] = [];
  const outline = await pdf.getOutline().catch(() => null);
  for (const o of outline ?? []) {
    try {
      const dest = typeof o.dest === "string" ? await pdf.getDestination(o.dest) : o.dest;
      if (dest?.[0]) starts.push({ page: (await pdf.getPageIndex(dest[0])) + 1, title: o.title.trim() });
    } catch {}
  }
  starts.sort((a, b) => a.page - b.page);
  const chapters: BookChapter[] = [];
  const chapter = (title: string, from: number, to: number) => {
    const ps = pages.slice(from - 1, to - 1);
    if (ps.length) chapters.push({ title, sub: title, pages: ps, paras: ps.map(p => pageText(p.items)) });
  };
  if (starts.length >= 2) {
    if (starts[0].page > 1) starts.unshift({ page: 1, title: "Opening" });
    starts.forEach((s, i) => chapter(s.title, s.page, starts[i + 1]?.page ?? pdf.numPages + 1));
  } else {
    for (let i = 1; i <= pages.length; i += 10) chapter(`Pages ${i}–${Math.min(i + 9, pdf.numPages)}`, i, i + 10);
  }

  // A small cover: the first page, drawn to a canvas.
  let cover: Blob | undefined;
  try {
    const page = await pdf.getPage(1), vp = page.getViewport({ scale: 1 }), scale = 240 / vp.height, v = page.getViewport({ scale });
    const canvas = document.createElement("canvas"); canvas.width = Math.round(v.width); canvas.height = Math.round(v.height);
    await page.render({ canvasContext: canvas.getContext("2d")!, viewport: v, canvas } as Parameters<typeof page.render>[0]).promise;
    cover = await new Promise<Blob | undefined>(r => canvas.toBlob(b => r(b ?? undefined), "image/jpeg", 0.8));
  } catch {}

  return { title: info.Title?.trim() || "", author: info.Author?.trim() || "", chapters, pages: pdf.numPages, cover, layout: "fixed" };
}
