// Turns a plain-text book (as Project Gutenberg publishes it) into chapters of paragraphs.
// Pure: used on the server for Gutenberg and testable without a browser.
import type { BookChapter } from "../model";

const SKIP = /^(contents|table of contents|illustrations|list of illustrations|index|footnotes|transcriber'?s note)\.?$/i;
const HEADING = /^(chapter|book|part|section|letter|lecture|essay|canto|act|scene|volume|preface|introduction|prologue|epilogue|appendix|conclusion|foreword)\b/i;
const ROMAN = /^[IVXLCDM]+\.?$/;

function clean(block: string): string {
  return block.replace(/\s*\n\s*/g, " ").replace(/_([^_]+)_/g, "$1").replace(/\s{2,}/g, " ").trim();
}

function isHeading(block: string): boolean {
  if (block.includes("\n")) return false;
  const t = block.trim();
  if (!t || t.length > 70) return false;
  if (HEADING.test(t) || ROMAN.test(t)) return true;
  const letters = t.replace(/[^A-Za-z]/g, "");
  return letters.length >= 3 && letters === letters.toUpperCase() && !/[.,;:]$/.test(t) && t.split(/\s+/).length <= 10;
}

const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s(-])([a-z])/g, (_, a, b) => a + b.toUpperCase()).replace(/\b(Chapter|Book|Part|Section|Volume|Act|Scene|Canto|Letter|Lecture) ([ivxlcdm]+)\b/gi, (_, w, n) => `${w} ${n.toUpperCase()}`).replace(/^[IVXLCDM][ivxlcdm]*\.?$/, w => w.toUpperCase()).replace(/\b(Of|The|And|In|On|To|A|An|For|At|By)\b(?!$)/g, w => w.toLowerCase()).replace(/^./, c => c.toUpperCase());
const tidy = (h: string) => (h === h.toUpperCase() ? titleCase(h) : h).replace(/\.$/, "");

export interface ParsedText { title?: string; author?: string; chapters: BookChapter[] }

export function parseGutenbergText(raw: string): ParsedText {
  const text = raw.replace(/\r/g, "").replace(/^﻿/, "");
  const title = text.match(/^Title:\s*(.+)$/m)?.[1]?.trim();
  const author = text.match(/^Author:\s*(.+)$/m)?.[1]?.trim();
  const start = text.search(/^\*\*\* ?START OF (THE|THIS) PROJECT GUTENBERG.*$/m);
  const end = text.search(/^\*\*\* ?END OF (THE|THIS) PROJECT GUTENBERG.*$/m);
  let body = text.slice(start >= 0 ? text.indexOf("\n", start) + 1 : 0, end >= 0 ? end : undefined);
  body = body.replace(/^End of (the )?Project Gutenberg.*$/gim, "");

  const blocks = body.split(/\n\s*\n/).map(b => b.replace(/^\n+|\n+$/g, "")).filter(b => b.trim());
  const sections: { heads: string[]; paras: string[] }[] = [];
  let cur: { heads: string[]; paras: string[] } = { heads: [], paras: [] };
  for (const b of blocks) {
    if (isHeading(b)) {
      if (cur.paras.length) { sections.push(cur); cur = { heads: [], paras: [] }; }
      cur.heads.push(b.trim());
    } else cur.paras.push(clean(b));
  }
  if (cur.paras.length || cur.heads.length) sections.push(cur);

  // Drop title pages, contents lists and indexes: sections whose "paragraphs" are mostly short lines.
  const real = sections.filter(sec => {
    if (sec.heads.some(h => SKIP.test(h.trim()))) return false;
    const long = sec.paras.filter(p => p.length > 120).length;
    return sec.paras.length > 0 && (long >= 1 || sec.paras.join(" ").length > 400);
  });

  let chapters: BookChapter[] = real.map((sec, i) => {
    const heads = sec.heads.map(tidy);
    const title = heads[0] ?? (i === 0 ? "Opening" : `Part ${i + 1}`);
    return { title, sub: heads[1] ?? title, paras: sec.paras };
  });

  // No usable headings: split into parts of about 30 paragraphs so pages still have chapters.
  if (chapters.length < 2) {
    const paras = chapters.flatMap(c => c.paras);
    chapters = [];
    for (let i = 0; i < paras.length; i += 30) chapters.push({ title: `Part ${chapters.length + 1}`, sub: `Part ${chapters.length + 1}`, paras: paras.slice(i, i + 30) });
  }
  return { title, author, chapters };
}

export function wordCount(chapters: BookChapter[]): number {
  return chapters.reduce((n, c) => n + c.paras.reduce((m, p) => m + p.split(/\s+/).length, 0), 0);
}
