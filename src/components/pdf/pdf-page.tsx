"use client";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { memo, useEffect, useRef } from "react";
import type { Highlight } from "@/lib/model";
import { HL_COLORS } from "@/lib/reader/export";

export type PdfTheme = "light" | "sepia" | "night";
export const PAGE_FILTER: Record<PdfTheme, string> = {
  light: "none",
  sepia: "sepia(0.45) saturate(1.15) brightness(0.96)",
  night: "invert(0.9) hue-rotate(180deg) brightness(0.92) contrast(0.95)",
};

// Search matches across the pages on screen, painted with the CSS Custom Highlight API.
const searchRanges = new Map<number, Range[]>();
let currentHit: Range | null = null;
function paintSearch() {
  const reg = (globalThis as { CSS?: { highlights?: Map<string, unknown> } }).CSS?.highlights;
  const H = (globalThis as { Highlight?: new (...r: Range[]) => unknown }).Highlight;
  if (!reg || !H) return;
  const all = [...searchRanges.values()].flat();
  if (all.length) reg.set("pdf-search", new H(...all)); else reg.delete("pdf-search");
  if (currentHit) reg.set("pdf-search-current", new H(currentHit)); else reg.delete("pdf-search-current");
}
export function clearSearchHighlights() { searchRanges.clear(); currentHit = null; paintSearch(); }

/** Finds `term` in a rendered text layer and returns DOM ranges for it. */
function findRanges(layer: HTMLElement, term: string): Range[] {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
  let text = ""; const starts: number[] = [];
  for (const n of nodes) { starts.push(text.length); text += n.data; }
  const hay = text.toLowerCase(), needle = term.toLowerCase(), out: Range[] = [];
  const at = (i: number) => { let k = starts.length - 1; while (k > 0 && starts[k] > i) k--; return { node: nodes[k], off: i - starts[k] }; };
  for (let i = hay.indexOf(needle); i !== -1 && out.length < 200; i = hay.indexOf(needle, i + needle.length)) {
    const a = at(i), b = at(i + needle.length - 1), r = document.createRange();
    r.setStart(a.node, a.off); r.setEnd(b.node, b.off + 1);
    out.push(r);
  }
  return out;
}

interface Props {
  pdf: PDFDocumentProxy; n: number; width: number; height: number; scale: number; render: boolean; theme: PdfTheme;
  highlights: Highlight[]; search: string; currentMatch: number | null; flashId: string | null;
}

/** One real PDF page: the drawn page, its selectable text, and your highlights. Drawn only while near the screen. */
export const PdfPage = memo(function PdfPage({ pdf, n, width, height, scale, render, theme, highlights, search, currentMatch, flashId }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const textReady = useRef(false);
  const w = Math.floor(width * scale), h = Math.floor(height * scale);

  useEffect(() => {
    if (!render) return;
    let cancelled = false, task: RenderTask | null = null, tl: { cancel: () => void } | null = null;
    const canvasEl = canvasRef.current, textEl = textRef.current;
    textReady.current = false;
    void (async () => {
      const page = await pdf.getPage(n);
      if (cancelled || !canvasRef.current) return;
      const viewport = page.getViewport({ scale });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const canvas = canvasRef.current;
      canvas.width = Math.floor(viewport.width * dpr); canvas.height = Math.floor(viewport.height * dpr);
      task = page.render({ canvasContext: canvas.getContext("2d")!, canvas, viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined } as Parameters<typeof page.render>[0]);
      try { await task.promise; } catch { return; }
      if (cancelled || !textRef.current) return;
      const { TextLayer } = await import("pdfjs-dist");
      const layer = textRef.current;
      layer.replaceChildren();
      const t = new TextLayer({ textContentSource: page.streamTextContent(), container: layer, viewport });
      tl = t;
      try { await t.render(); } catch { return; }
      if (cancelled) return;
      const end = document.createElement("div"); end.className = "endOfContent"; layer.append(end);
      textReady.current = true;
      layer.dispatchEvent(new Event("textready"));
    })();
    return () => {
      cancelled = true; task?.cancel(); tl?.cancel();
      searchRanges.delete(n); paintSearch();
      if (canvasEl) { canvasEl.width = 0; canvasEl.height = 0; } // free the bitmap once the page is far away
      textEl?.replaceChildren();
    };
  }, [pdf, n, scale, render]);

  // Search matches on this page.
  useEffect(() => {
    const layer = textRef.current;
    if (!layer || !render) return;
    const apply = () => {
      if (!search.trim()) { searchRanges.delete(n); paintSearch(); return; }
      const ranges = findRanges(layer, search.trim());
      searchRanges.set(n, ranges);
      if (currentMatch !== null && ranges[currentMatch]) currentHit = ranges[currentMatch];
      paintSearch();
    };
    if (textReady.current) apply();
    layer.addEventListener("textready", apply);
    return () => layer.removeEventListener("textready", apply);
  }, [search, currentMatch, n, render]);

  // While selecting, let the selection run past the last line (as pdf.js's own viewer does).
  useEffect(() => {
    const layer = textRef.current;
    if (!layer) return;
    const down = () => layer.classList.add("selecting"), up = () => layer.classList.remove("selecting");
    layer.addEventListener("pointerdown", down);
    document.addEventListener("pointerup", up);
    return () => { layer.removeEventListener("pointerdown", down); document.removeEventListener("pointerup", up); };
  }, []);

  return (
    <div data-page={n} className="pdf-page relative mx-auto bg-white ring-1 ring-black/10"
      style={{ width: w, height: h, ["--scale-factor" as string]: scale, ["--total-scale-factor" as string]: scale }}>
      <canvas ref={canvasRef} className="absolute inset-0" style={{ width: w, height: h, filter: PAGE_FILTER[theme] }} />
      {!render && <span className="absolute inset-0 grid place-items-center text-[12px] text-black/25">{n}</span>}
      <div className="pointer-events-none absolute inset-0 z-[1]">
        {highlights.flatMap(hl => (hl.rects ?? []).map(([x, y, rw, rh], i) => (
          <span key={`${hl.id}:${i}`} className={flashId === hl.id ? "pdf-flash" : undefined}
            style={{ position: "absolute", left: `${x * 100}%`, top: `${y * 100}%`, width: `${rw * 100}%`, height: `${rh * 100}%`, background: HL_COLORS[hl.color] ?? HL_COLORS.yellow,
              opacity: theme === "night" ? 0.38 : 0.42, mixBlendMode: theme === "night" ? "normal" : "multiply", borderRadius: 2 }} />
        )))}
        {highlights.filter(hl => hl.note && hl.rects?.length).map(hl => {
          const [x, y] = hl.rects![0];
          return <span key={`${hl.id}:note`} title={hl.note} style={{ position: "absolute", left: `calc(${x * 100}% - 14px)`, top: `${y * 100}%`, fontSize: 11 }} aria-hidden>✎</span>;
        })}
      </div>
      <div ref={textRef} className="textLayer" />
    </div>
  );
});
