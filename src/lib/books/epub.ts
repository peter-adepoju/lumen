// Reads an EPUB the user owns into Lumen's book format: chapters of paragraphs.
// Uses JSZip and plain string parsing, so it runs in the browser and in tests alike.
import JSZip from "jszip";
import type { BookChapter } from "../model";

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

export interface ParsedEpub { title: string; author: string; chapters: BookChapter[]; cover?: Blob }

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
  for (const idref of spine) {
    const item = manifest.get(idref);
    if (!item || !/html|xml/.test(item.type)) continue;
    const blocks = xhtmlBlocks((await read(item.href)) ?? "");
    const paras = blocks.filter(b => b.kind === "p").map(b => b.text);
    if (!paras.length || paras.join(" ").length < 80) continue; // covers, title pages, blank separators
    const heading = blocks.find(b => b.kind === "h")?.text;
    const title = names.get(item.href) ?? heading ?? `Chapter ${chapters.length + 1}`;
    chapters.push({ title, sub: heading && heading !== title ? heading : title, paras });
  }
  if (!chapters.length) throw new Error("no_text");

  let cover: Blob | undefined;
  const coverId = attr(opf.match(/<meta\b[^>]*name=["']cover["'][^>]*>/i)?.[0] ?? "", "content");
  const coverItem = (coverId && manifest.get(coverId)) || [...manifest.values()].find(m => m.props.includes("cover-image"));
  if (coverItem && /^image\//.test(coverItem.type)) { const b = await zip.file(coverItem.href)?.async("blob"); if (b) cover = new Blob([b], { type: coverItem.type }); }

  return { title: meta("title") || "Untitled", author: meta("creator") || "Unknown author", chapters, cover };
}
