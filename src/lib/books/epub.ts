// Reads an EPUB the user owns into Lumen's book format: chapters of paragraphs.
// Uses JSZip and plain string parsing, so it runs in the browser and in tests alike.
import JSZip from "jszip";
import type { BookChapter, BookLook } from "../model";

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–", hellip: "…", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”" };
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] === "#") { const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
    return ENT[e.toLowerCase()] ?? m;
  });
}
const stripTags = (s: string) => decodeEntities(s.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
const attr = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1];

function resolve(base: string, href: string): string {
  const parts = (base.includes("/") ? base.slice(0, base.lastIndexOf("/") + 1) : "").concat(decodeURIComponent(href.split("#")[0])).split("/");
  const out: string[] = [];
  for (const p of parts) { if (p === "..") out.pop(); else if (p && p !== ".") out.push(p); }
  return out.join("/");
}

/** One XHTML file → its headings and paragraphs, in order. */
export function xhtmlBlocks(xhtml: string): { kind: "h" | "p"; text: string }[] {
  const body = (xhtml.match(/<body[\s\S]*?>([\s\S]*)<\/body>/i)?.[1] ?? xhtml).replace(/<(script|style)[\s\S]*?<\/\1>/gi, "");
  const out: { kind: "h" | "p"; text: string }[] = [];
  const re = /<(h[1-6]|p|li|blockquote|pre|div)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const tag = m[1].toLowerCase();
    if (tag === "div" && /<(p|h[1-6]|div)\b/i.test(m[2])) { re.lastIndex = m.index + m[0].indexOf(">") + 1; continue; } // a wrapper div: look inside it
    const text = stripTags(m[2]);
    if (text) out.push({ kind: tag[0] === "h" ? "h" : "p", text });
  }
  return out;
}

export interface ParsedEpub { title: string; author: string; chapters: BookChapter[]; cover?: Blob; look: BookLook }

/* ---------- The book's own look ---------- */

const PLAIN = /^(#fff(fff)?|white|transparent|inherit|initial|unset|none|currentcolor|rgba?\(\s*255\s*,\s*255\s*,\s*255\s*(,\s*1(\.0+)?\s*)?\)|rgba\([^)]*,\s*0(\.0+)?\s*\))$/i;
const KEYWORDS = /^(no-repeat|repeat|repeat-x|repeat-y|round|space|center|top|bottom|left|right|fixed|scroll|local|cover|contain|auto|border-box|padding-box|content-box|none|inherit|initial|unset|revert)$/i;
/** The colour in a `background` shorthand, e.g. "url(bg.jpg) #f4ecd8 no-repeat" → "#f4ecd8". */
const colorIn = (v: string): string | undefined => {
  const tokens = v.replace(/url\([^)]*\)/gi, " ").replace(/\(([^)]*)\)/g, m => m.replace(/\s+/g, "")).split(/[\s/]+/).filter(Boolean);
  return tokens.find(t => /^#[0-9a-f]{3,8}$/i.test(t) || /^(rgb|hsl)a?\(/i.test(t) || (/^[a-z]+$/i.test(t) && !KEYWORDS.test(t)));
};
const urlIn = (v: string) => v.match(/url\(\s*["']?([^"')]+)["']?\s*\)/i)?.[1];

/**
 * Finds the page background and text colour a book's stylesheets give the page:
 * rules for html, body, or the classes on its <body>, in cascade order, then the
 * body's own style attribute. A plain white or transparent background counts as none.
 */
export function lookFromCss(sheets: { css: string; base: string }[], bodyClasses: string[], bodyStyle = ""): { bg?: string; fg?: string; image?: string } {
  const out: { bg?: string; fg?: string; image?: string } = {};
  const matches = (sel: string) => {
    const t = sel.trim().toLowerCase().replace(/\s+/g, " ");
    if (t === "html" || t === "body" || t === "html body" || t === ":root") return true;
    const cls = t.match(/^(?:body|html)?((?:\.[\w-]+)+)$/)?.[1];
    return !!cls && cls.split(".").filter(Boolean).every(c => bodyClasses.includes(c));
  };
  const apply = (decls: string, base: string) => {
    for (const d of decls.split(";")) {
      const i = d.indexOf(":"); if (i < 0) continue;
      const prop = d.slice(0, i).trim().toLowerCase(), val = d.slice(i + 1).replace(/!important/i, "").trim();
      if (prop === "background-color") out.bg = val;
      else if (prop === "background") { const c = colorIn(val), u = urlIn(val); if (c) out.bg = c; if (u) out.image = resolve(base, u); else if (/\bnone\b/i.test(val)) out.image = undefined; }
      else if (prop === "background-image") { const u = urlIn(val); out.image = u ? resolve(base, u) : undefined; }
      else if (prop === "color") out.fg = val;
    }
  };
  for (const { css, base } of sheets) {
    const clean = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/@media[^{]*\{([\s\S]*?\})\s*\}/g, "").replace(/@[a-z-]+[^{;]*;/gi, "");
    for (const m of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) if (m[1].split(",").some(matches)) apply(m[2], base);
  }
  if (bodyStyle) apply(bodyStyle, "");
  if (out.bg && PLAIN.test(out.bg.trim())) out.bg = undefined;
  return out;
}

const MAX_BG_IMAGE = 1.5 * 1024 * 1024;

/** The book's own page look, ready for the reader: colours, and a background image as a data URL. */
async function bookLook(zip: JSZip, manifest: Map<string, { href: string; type: string; props: string }>, firstDoc: { href: string; xhtml: string } | null): Promise<BookLook> {
  if (!firstDoc) return {};
  const head = firstDoc.xhtml.match(/<head[\s\S]*?<\/head>/i)?.[0] ?? "";
  const sheets: { css: string; base: string }[] = [];
  for (const link of head.match(/<link\b[^>]*>/gi) ?? []) {
    if (!/stylesheet/i.test(attr(link, "rel") ?? "")) continue;
    const href = attr(link, "href"); if (!href) continue;
    const path = resolve(firstDoc.href, href), css = await zip.file(path)?.async("string");
    if (css) sheets.push({ css, base: path });
  }
  for (const m of head.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) sheets.push({ css: m[1], base: firstDoc.href });
  if (!sheets.length) for (const it of manifest.values()) if (it.type === "text/css") { const css = await zip.file(it.href)?.async("string"); if (css) sheets.push({ css, base: it.href }); }
  const bodyTag = firstDoc.xhtml.match(/<body\b[^>]*>/i)?.[0] ?? "";
  const found = lookFromCss(sheets, (attr(bodyTag, "class") ?? "").split(/\s+/).filter(Boolean), attr(bodyTag, "style") ?? "");
  const look: BookLook = {};
  if (found.bg) look.bg = found.bg;
  if (found.image) {
    const f = zip.file(found.image), b64 = f ? await f.async("base64") : null;
    const type = [...manifest.values()].find(m => m.href === found.image)?.type || (/\.png$/i.test(found.image) ? "image/png" : /\.svg$/i.test(found.image) ? "image/svg+xml" : "image/jpeg");
    if (b64 && b64.length * 0.75 <= MAX_BG_IMAGE && /^image\//.test(type)) look.image = `data:${type};base64,${b64}`;
  }
  if ((look.bg || look.image) && found.fg && !PLAIN.test(found.fg)) look.fg = found.fg;
  return look;
}

/** Just the look of an EPUB (for books added before Lumen read it). */
export async function epubLook(data: ArrayBuffer | Blob | Uint8Array): Promise<BookLook> {
  return (await parseEpub(data)).look;
}

export async function parseEpub(data: ArrayBuffer | Blob | Uint8Array): Promise<ParsedEpub> {
  const zip = await JSZip.loadAsync(data);
  const read = (p: string) => zip.file(p)?.async("string");
  const container = await read("META-INF/container.xml");
  const opfPath = container && attr(container.match(/<rootfile\b[^>]*>/i)?.[0] ?? "", "full-path");
  if (!opfPath) throw new Error("not_epub");
  const opf = (await read(opfPath)) ?? "";
  const meta = (tag: string) => stripTags(opf.match(new RegExp(`<dc:${tag}\\b[^>]*>([\\s\\S]*?)</dc:${tag}>`, "i"))?.[1] ?? "");

  const manifest = new Map<string, { href: string; type: string; props: string }>();
  for (const t of opf.match(/<item\b[^>]*\/?>/gi) ?? []) {
    const id = attr(t, "id"), href = attr(t, "href");
    if (id && href) manifest.set(id, { href: resolve(opfPath, href), type: attr(t, "media-type") ?? "", props: attr(t, "properties") ?? "" });
  }
  const spine = (opf.match(/<itemref\b[^>]*\/?>/gi) ?? []).map(t => attr(t, "idref")).filter(Boolean) as string[];

  // Chapter names from the table of contents, when there is one.
  const names = new Map<string, string>();
  const nav = [...manifest.values()].find(m => m.props.includes("nav"));
  const ncxId = opf.match(/<spine\b[^>]*\btoc=["']([^"']+)["']/i)?.[1];
  const ncx = ncxId ? manifest.get(ncxId) : undefined;
  if (nav) {
    const html = (await read(nav.href)) ?? "";
    for (const a of html.match(/<a\b[^>]*href=["'][^"']+["'][^>]*>[\s\S]*?<\/a>/gi) ?? []) {
      const href = attr(a, "href"); if (href) names.set(resolve(nav.href, href), stripTags(a));
    }
  } else if (ncx) {
    const x = (await read(ncx.href)) ?? "";
    for (const pt of x.match(/<navPoint\b[\s\S]*?<\/navPoint>/gi) ?? []) {
      const label = stripTags(pt.match(/<text>([\s\S]*?)<\/text>/i)?.[1] ?? ""), src = attr(pt.match(/<content\b[^>]*>/i)?.[0] ?? "", "src");
      if (src && label && !names.has(resolve(ncx.href, src))) names.set(resolve(ncx.href, src), label);
    }
  }

  const chapters: BookChapter[] = [];
  let firstDoc: { href: string; xhtml: string } | null = null;
  for (const idref of spine) {
    const item = manifest.get(idref);
    if (!item || !/html|xml/.test(item.type)) continue;
    const xhtml = (await read(item.href)) ?? "";
    const blocks = xhtmlBlocks(xhtml);
    const paras = blocks.filter(b => b.kind === "p").map(b => b.text);
    if (!paras.length || paras.join(" ").length < 80) continue; // covers, title pages, blank separators
    if (!firstDoc) firstDoc = { href: item.href, xhtml }; // the first real chapter shows the book's normal page
    const heading = blocks.find(b => b.kind === "h")?.text;
    const title = names.get(item.href) ?? heading ?? `Chapter ${chapters.length + 1}`;
    chapters.push({ title, sub: heading && heading !== title ? heading : title, paras });
  }
  if (!chapters.length) throw new Error("no_text");

  let cover: Blob | undefined;
  const coverId = attr(opf.match(/<meta\b[^>]*name=["']cover["'][^>]*>/i)?.[0] ?? "", "content");
  const coverItem = (coverId && manifest.get(coverId)) || [...manifest.values()].find(m => m.props.includes("cover-image"));
  if (coverItem && /^image\//.test(coverItem.type)) { const b = await zip.file(coverItem.href)?.async("blob"); if (b) cover = new Blob([b], { type: coverItem.type }); }

  const look = await bookLook(zip, manifest, firstDoc).catch(() => ({}));
  return { title: meta("title") || "Untitled", author: meta("creator") || "Unknown author", chapters, cover, look };
}
