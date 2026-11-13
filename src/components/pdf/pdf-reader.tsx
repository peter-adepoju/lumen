"use client";
import type { PDFDocumentProxy } from "pdfjs-dist";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BookDoc, Highlight, ReadingState } from "@/lib/model";
import { moveBook } from "@/lib/books/library";
import { HL_COLORS, HL_NAMES, downloadExport, type ExportFormat, type ExportItem } from "@/lib/reader/export";
import { store, useStore } from "@/lib/store/store";
import { cn } from "@/components/ui";
import { clearSearchHighlights, PdfPage, type PdfTheme } from "./pdf-page";

/* A PDF reader in the style of Selah's: the real pages in one continuous scroll, a slim
   toolbar, zoom, contents and page thumbnails, search, highlights, bookmarks and themes. */

const GAP = 14, PAD = 16;
type Panel = "outline" | "thumbs" | "highlights" | "bookmarks" | "search" | "explain";
interface Sel { rects: Map<number, [number, number, number, number][]>; texts: Map<number, string>; x: number; y: number; text: string }
type Query = { text: string; page: number | null; idx: number };
const COLOR_KEYS = Object.keys(HL_COLORS);
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

const ICONS: Record<string, React.ReactNode> = {
  back: <path d="M15 6l-6 6 6 6" />, panel: <><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="M9 4.5v15" /></>,
  up: <path d="M6 15l6-6 6 6" />, down: <path d="M6 9l6 6 6-6" />, minus: <path d="M6 12h12" />, plus: <path d="M12 6v12M6 12h12" />,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4-4" /></>, highlight: <><path d="M14 4l6 6-8 8H6v-6z" /><path d="M4 20h7" /></>,
  bookmark: <path d="M6 3.5h12v17l-6-4-6 4z" />, list: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></>,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />, speaker: <><path d="M4 9v6h4l5 4V5L8 9z" /><path d="M16.5 8.5a5 5 0 0 1 0 7" /></>,
  stop: <rect x="7" y="7" width="10" height="10" rx="1.5" />, full: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  download: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />, x: <path d="M6 6l12 12M18 6L6 18" />, note: <><path d="M5 4h10l4 4v12H5z" /><path d="M8 12h8M8 16h6" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></>,
  spark: <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM18 15l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9z" />,
  trash: <path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" />,
};
const Ic = ({ n, s = 16 }: { n: keyof typeof ICONS; s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{ICONS[n]}</svg>
);

function Btn({ label, on, active, children, className }: { label: string; on: () => void; active?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <button onClick={on} title={label} aria-label={label} aria-pressed={active}
      className={cn("grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg", active && "bg-[var(--gold-soft)] text-fg", className)}>{children}</button>
  );
}

/** Joins the per-word rectangles of a selection into one box per line. */
function mergeRects(rs: DOMRect[]) {
  const sorted = [...rs].sort((a, b) => a.top - b.top || a.left - b.left);
  const out: { left: number; top: number; right: number; bottom: number }[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && Math.abs(r.top - last.top) < r.height * 0.5 && r.left <= last.right + 6) {
      last.right = Math.max(last.right, r.right); last.bottom = Math.max(last.bottom, r.bottom); last.top = Math.min(last.top, r.top);
    } else out.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
  }
  return out.map(r => ({ left: r.left, top: r.top, width: r.right - r.left, height: r.bottom - r.top }));
}

export interface PdfReaderProps {
  pdf: PDFDocumentProxy; book: BookDoc; file: Blob;
  explain?: (prompt: string) => Promise<string>;
  startPanel?: Panel | null;
}

export function PdfReader({ pdf, book, file, explain, startPanel }: PdfReaderProps) {
  const s = useStore();
  const N = pdf.numPages;
  const scroller = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const st: ReadingState | undefined = s.get("reading")?.[book.id];
  const theme = ((s.get("readerSettings")?.pdfTheme as PdfTheme) ?? "light");
  const [sizes, setSizes] = useState<{ w: number; h: number }[] | null>(null);
  const [zoom, setZoom] = useState<{ fit: true } | { fit: false; scale: number }>(() => {
    try { const z = Number(localStorage.getItem(`lumen-pdf-zoom-${book.id}`)); if (z > 0) return { fit: false, scale: z }; } catch {}
    return { fit: true };
  });
  const [boxW, setBoxW] = useState(800);
  const [page, setPage] = useState(1);
  const [near, setNear] = useState<Set<number>>(new Set([1, 2]));
  const [panel, setPanel] = useState<Panel | null>(startPanel ?? null);
  const [sel, setSel] = useState<Sel | null>(null);
  const [openHl, setOpenHl] = useState<{ id: string; x: number; y: number } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [query, setQuery] = useState<Query>({ text: "", page: null, idx: 0 });
  const [ask, setAsk] = useState<{ id: number; prompt: string; label: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const say = useCallback((t: string) => { setToast(t); setTimeout(() => setToast(cur => (cur === t ? null : cur)), 2200); }, []);

  const hls = useMemo(() => st?.hl ?? [], [st]);
  const hlByPage = useMemo(() => { const m = new Map<number, Highlight[]>(); for (const h of hls) if (h.rects?.length) m.set(h.page, [...(m.get(h.page) ?? []), h]); return m; }, [hls]);
  const bookmarks = useMemo(() => (st?.bookmarks ?? []).map(b => b.p).filter(n => n >= 1 && n <= N).sort((a, b) => a - b), [st, N]);
  const saveState = useCallback((fn: (cur: ReadingState) => ReadingState) => {
    store.update("reading", r => {
      const cur: ReadingState = r?.[book.id] ?? { ch: 0, p: 0, hl: [], notes: [], bookmarks: [], day: null, todayFrom: null, readToday: [] };
      return { ...(r ?? {}), [book.id]: fn(cur) };
    });
  }, [book.id]);

  // Section names from the book's contents, for exports and Today's reading.
  const sectionOf = useCallback((n: number) => {
    let name = "", at = 0;
    for (const c of book.chapters) { const first = c.pages?.[0]?.n; if (first && first <= n && first >= at) { at = first; name = c.title; } }
    return name || `Page ${n}`;
  }, [book.chapters]);

  // Page sizes at 100%, read in batches so big books open quickly.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const first = (await pdf.getPage(1)).getViewport({ scale: 1 });
      const out = Array.from({ length: N }, () => ({ w: first.width, h: first.height }));
      if (alive) setSizes([...out]);
      for (let i = 2; i <= N && alive; i++) {
        const v = (await pdf.getPage(i)).getViewport({ scale: 1 });
        out[i - 1] = { w: v.width, h: v.height };
        if (i % 50 === 0 || i === N) { if (alive) setSizes([...out]); }
      }
    })();
    return () => { alive = false; };
  }, [pdf, N]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const maxW = sizes ? Math.max(...sizes.map(x => x.w)) : 600;
  const fitScale = Math.max(0.3, Math.min(3, (boxW - PAD * 2) / maxW));
  const scale = zoom.fit ? Math.min(fitScale, 2) : zoom.scale;
  const tops = useMemo(() => {
    if (!sizes) return [];
    const t: number[] = []; let y = PAD;
    for (const z of sizes) { t.push(y); y += Math.floor(z.h * scale) + GAP; }
    t.push(y);
    return t;
  }, [sizes, scale]);

  const target = useRef<{ page: number; at: number } | null>(null);
  const goTo = useCallback((n: number, smooth = false) => {
    const el = scroller.current;
    if (!el || !tops.length) return;
    const p = Math.max(1, Math.min(N, n));
    target.current = smooth ? { page: p, at: Date.now() } : null;
    el.scrollTo({ top: tops[p - 1] - 8, behavior: smooth ? "smooth" : "auto" });
  }, [tops, N]);
  const from = () => (target.current && Date.now() - target.current.at < 700 ? target.current.page : page);

  // First open: back to where you stopped.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || !tops.length) return;
    opened.current = true;
    const want = st?.at?.page ?? 1;
    requestAnimationFrame(() => goTo(want));
  }, [tops, goTo, st]);

  // Keep your place when zooming.
  const anchor = useRef<{ page: number; frac: number } | null>(null);
  const prevScale = useRef(scale);
  useEffect(() => {
    if (prevScale.current === scale || !anchor.current || !tops.length) { prevScale.current = scale; return; }
    prevScale.current = scale;
    const { page: p, frac } = anchor.current;
    scroller.current!.scrollTop = tops[p - 1] + frac * (tops[p] - tops[p - 1]) - 8;
  }, [scale, tops]);

  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (!el || !tops.length) return;
    const y = el.scrollTop + el.clientHeight * 0.3;
    let lo = 0, hi = N - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (tops[mid] <= y) lo = mid; else hi = mid - 1; }
    const p = lo + 1;
    setPage(p);
    anchor.current = { page: p, frac: (el.scrollTop + 8 - tops[p - 1]) / Math.max(1, tops[p] - tops[p - 1]) };
    const top = el.scrollTop - el.clientHeight, bottom = el.scrollTop + el.clientHeight * 2;
    const next = new Set<number>();
    for (let i = 0; i < N; i++) if (tops[i + 1] > top && tops[i] < bottom) next.add(i + 1);
    setNear(cur => (cur.size === next.size && [...next].every(x => cur.has(x)) ? cur : next));
  }, [tops, N]);
  useEffect(() => { onScroll(); }, [onScroll]);

  // Save your place a moment after you stop on a page (and Today's reading counts it).
  useEffect(() => {
    if (!opened.current) return;
    const t = setTimeout(() => {
      const at = { page, total: N, pct: Math.round((page / N) * 100), chapter: sectionOf(page) }, day = today();
      saveState(cur => {
        const fresh = cur.day !== day;
        const readToday = fresh ? [page - 1] : cur.readToday.includes(page - 1) ? cur.readToday : [...cur.readToday, page - 1];
        return { ...cur, ch: 0, p: page - 1, at, day, todayFrom: fresh || cur.todayFrom == null ? page - 1 : cur.todayFrom, readToday };
      });
      store.update("library", lib => (lib ?? []).map(b => (b.id === book.id ? { ...b, at, lastReadAt: Date.now() } : b)));
    }, 1200);
    return () => clearTimeout(t);
  }, [page, N, book.id, saveState, sectionOf]);

  useEffect(() => { if (!flash) return; const t = setTimeout(() => setFlash(null), 2500); return () => clearTimeout(t); }, [flash]);
  useEffect(() => () => clearSearchHighlights(), []);

  const setZoomScale = (v: number) => {
    const z = Math.round(Math.max(0.4, Math.min(4, v)) * 100) / 100;
    setZoom({ fit: false, scale: z });
    try { localStorage.setItem(`lumen-pdf-zoom-${book.id}`, String(z)); } catch {}
  };
  const fit = () => { setZoom({ fit: true }); try { localStorage.removeItem(`lumen-pdf-zoom-${book.id}`); } catch {} };
  const setTheme = (t: PdfTheme) => store.set("readerSettings", { ...(store.get("readerSettings") ?? {}), pdfTheme: t });
  const bookmarked = bookmarks.includes(page);
  const toggleBookmark = useCallback(() => {
    const has = bookmarks.includes(page);
    saveState(cur => ({ ...cur, bookmarks: has ? cur.bookmarks.filter(b => b.p !== page) : [...cur.bookmarks, { id: uid(), ch: 0, p: page, at: Date.now(), text: `Page ${page}` }] }));
    say(has ? `Bookmark removed (p. ${page})` : `Bookmarked page ${page}`);
  }, [bookmarks, page, saveState, say]);

  // Selecting text → the highlight bar.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const check = () => {
      const s = document.getSelection(), el = scroller.current;
      if (!s || s.isCollapsed || !el || !s.rangeCount) { setSel(null); return; }
      const range = s.getRangeAt(0);
      if (!el.contains(range.commonAncestorContainer)) { setSel(null); return; }
      const rects = new Map<number, [number, number, number, number][]>(), texts = new Map<number, string>();
      let last: DOMRect | null = null;
      for (const pageEl of el.querySelectorAll<HTMLElement>("[data-page]")) {
        const layer = pageEl.querySelector<HTMLElement>(".textLayer");
        if (!layer || !range.intersectsNode(layer)) continue;
        const r = range.cloneRange();
        if (!layer.contains(r.startContainer)) r.setStart(layer, 0);
        if (!layer.contains(r.endContainer)) r.setEnd(layer, layer.childNodes.length);
        const box = pageEl.getBoundingClientRect();
        const list = mergeRects([...r.getClientRects()].filter(x => x.width > 1 && x.height > 1 && x.height < box.height * 0.2))
          .map(x => [(x.left - box.left) / box.width, (x.top - box.top) / box.height, x.width / box.width, x.height / box.height] as [number, number, number, number]);
        const text = r.toString().replace(/\s+/g, " ").trim();
        if (!list.length || !text) continue;
        const n = Number(pageEl.dataset.page);
        rects.set(n, list); texts.set(n, text);
        const rs = r.getClientRects(); last = rs[rs.length - 1] ?? last;
      }
      if (!rects.size || !last) { setSel(null); return; }
      setSel({ rects, texts, x: last.right, y: last.bottom, text: [...texts.values()].join(" ") });
    };
    const on = () => { if (t) clearTimeout(t); t = setTimeout(check, 250); };
    document.addEventListener("selectionchange", on);
    return () => { document.removeEventListener("selectionchange", on); if (t) clearTimeout(t); };
  }, []);

  const createHighlights = (color: string, note = "") => {
    if (!sel) return 0;
    const group = uid(), made: Highlight[] = [];
    for (const [n, rects] of sel.rects) made.push({ id: uid(), group, ch: 0, p: n - 1, s: 0, e: 0, color, note, text: sel.texts.get(n) ?? "", at: Date.now(), page: n, rects });
    saveState(cur => ({ ...cur, hl: [...cur.hl, ...made] }));
    document.getSelection()?.removeAllRanges();
    setSel(null);
    return made.length;
  };
  const updateHl = (id: string, patch: Partial<Highlight>) => saveState(cur => ({ ...cur, hl: cur.hl.map(h => (h.id === id ? { ...h, ...patch } : h)) }));
  const removeHl = (id: string) => saveState(cur => ({ ...cur, hl: cur.hl.filter(h => h.id !== id) }));

  // Tap a highlight to change it.
  const onClick = (e: React.MouseEvent) => {
    if (document.getSelection()?.toString()) return;
    const pageEl = (e.target as HTMLElement).closest<HTMLElement>("[data-page]");
    if (!pageEl) { setOpenHl(null); return; }
    const box = pageEl.getBoundingClientRect();
    const x = (e.clientX - box.left) / box.width, y = (e.clientY - box.top) / box.height, n = Number(pageEl.dataset.page);
    const hit = (hlByPage.get(n) ?? []).find(h => h.rects!.some(([rx, ry, rw, rh]) => x >= rx && x <= rx + rw && y >= ry - 0.004 && y <= ry + rh + 0.004));
    setOpenHl(hit ? { id: hit.id, x: e.clientX, y: e.clientY } : null);
  };

  // Keyboard.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable=true]")) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") { e.preventDefault(); setPanel("search"); return; }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === "j") { e.preventDefault(); goTo(from() + 1, true); }
      else if (e.key === "ArrowLeft" || e.key === "PageUp" || e.key === "k") { e.preventDefault(); goTo(from() - 1, true); }
      else if (e.key === "+" || e.key === "=") setZoomScale(scale * 1.15);
      else if (e.key === "-") setZoomScale(scale / 1.15);
      else if (e.key === "0") fit();
      else if (e.key === "b") toggleBookmark();
      else if (e.key === "Escape") { setPanel(null); setOpenHl(null); setSel(null); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  // A page's text (search, read aloud, explain, bookmarks).
  const textCache = useRef(new Map<number, string>());
  const pageText = useCallback(async (n: number) => {
    const hit = textCache.current.get(n);
    if (hit !== undefined) return hit;
    const tc = await (await pdf.getPage(n)).getTextContent();
    const text = tc.items.map(i => ("str" in i ? i.str + (i.hasEOL ? "\n" : "") : "")).join("").replace(/[ \t]+/g, " ");
    textCache.current.set(n, text);
    return text;
  }, [pdf]);

  const explainSel = explain ? () => {
    if (!sel) return;
    setAsk({ id: Date.now(), label: sel.text, prompt: `You help a reader understand a passage from "${book.title}" by ${book.author}. In 2 or 3 short, plain sentences, explain what it means and one way to apply it today. Passage: """${sel.text.slice(0, 1500)}"""` });
    setPanel("explain"); document.getSelection()?.removeAllRanges(); setSel(null);
  } : undefined;

  const bg = theme === "night" ? "#0d0d0f" : theme === "sepia" ? "#e9e0c9" : "var(--surface-2)";
  const openHlRow = openHl ? hls.find(h => h.id === openHl.id) : null;
  const entry = s.get("library")?.find(b => b.id === book.id);

  return (
    <div ref={root} className="fixed inset-0 z-40 flex flex-col bg-bg text-fg">
      <Toolbar title={book.title} page={page} N={N} goTo={goTo} scale={scale} fitted={zoom.fit} setZoomScale={setZoomScale} fit={fit}
        panel={panel} setPanel={setPanel} theme={theme} setTheme={setTheme} bookmarked={bookmarked} toggleBookmark={toggleBookmark}
        pageText={pageText} rootEl={root} file={file} say={say} />
      <div className="relative flex min-h-0 flex-1">
        {panel && (
          <aside className="absolute inset-y-0 left-0 z-20 flex w-72 max-w-[85vw] flex-col border-r border-border bg-surface md:static">
            <SidePanel panel={panel} setPanel={setPanel} pdf={pdf} book={book} hls={hls} page={page} goTo={n => goTo(n)} pageText={pageText}
              query={query} setQuery={setQuery} flash={id => setFlash(id)} bookmarks={bookmarks} removeBookmark={n => saveState(cur => ({ ...cur, bookmarks: cur.bookmarks.filter(b => b.p !== n) }))}
              ask={ask} setAsk={setAsk} explain={explain} sectionOf={sectionOf} say={say} />
          </aside>
        )}
        <div ref={scroller} onScroll={onScroll} onClick={onClick} className="min-h-0 flex-1 overflow-auto" style={{ background: bg }}>
          {!sizes ? <div className="grid h-full place-items-center"><div className="orb size-10" aria-label="Opening the book" /></div> : (
            <div className="relative" style={{ height: tops[N], minWidth: Math.floor(maxW * scale) + PAD * 2 }}>
              {sizes.map((z, i) => (
                <div key={i} className="absolute inset-x-0" style={{ top: tops[i] }}>
                  <PdfPage pdf={pdf} n={i + 1} width={z.w} height={z.h} scale={scale} render={near.has(i + 1)} theme={theme}
                    highlights={hlByPage.get(i + 1) ?? []} search={query.text} currentMatch={query.page === i + 1 ? query.idx : null} flashId={flash} />
                </div>
              ))}
            </div>
          )}
        </div>
        {page === N && entry && entry.shelf !== "finished" && (
          <div className="absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 whitespace-nowrap rounded-full border border-border bg-surface px-4 py-2 text-[13px]">
            You reached the end.
            <button className="rounded-full bg-primary px-3 py-1 text-[12.5px] font-medium text-on-primary" onClick={() => { void moveBook(book.id, "finished"); say("Moved to Finished. Well done!"); }}>Mark as finished</button>
          </div>
        )}
      </div>
      {sel && <SelectionBar sel={sel} title={book.title} create={createHighlights} onExplain={explainSel} say={say} />}
      {openHl && openHlRow && <HighlightEditor key={openHlRow.id} hl={openHlRow} x={openHl.x} y={openHl.y} title={book.title}
        update={p => updateHl(openHlRow.id, p)} remove={() => { removeHl(openHlRow.id); setOpenHl(null); }} onClose={() => setOpenHl(null)} say={say} />}
      {toast && <div role="status" className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-fg px-4 py-2 text-[13px] text-bg">{toast}</div>}
    </div>
  );
}

function Toolbar(p: {
  title: string; page: number; N: number; goTo: (n: number, smooth?: boolean) => void; scale: number; fitted: boolean; setZoomScale: (s: number) => void; fit: () => void;
  panel: Panel | null; setPanel: (p: Panel | null) => void; theme: PdfTheme; setTheme: (t: PdfTheme) => void; bookmarked: boolean; toggleBookmark: () => void;
  pageText: (n: number) => Promise<string>; rootEl: React.RefObject<HTMLDivElement | null>; file: Blob; say: (t: string) => void;
}) {
  const [pageInput, setPageInput] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const toggle = (x: Panel) => p.setPanel(p.panel === x ? null : x);
  const speak = async () => {
    if (speaking) { speechSynthesis.cancel(); setSpeaking(false); return; }
    if (!("speechSynthesis" in window)) { p.say("Reading aloud isn't supported in this browser"); return; }
    const u = new SpeechSynthesisUtterance((await p.pageText(p.page)).replace(/\n/g, " "));
    u.onend = () => setSpeaking(false); u.onerror = () => setSpeaking(false);
    speechSynthesis.cancel(); speechSynthesis.speak(u); setSpeaking(true);
  };
  useEffect(() => () => { if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel(); }, []);
  const sep = <span className="mx-1 h-5 w-px shrink-0 bg-border" />;
  return (
    <header className="no-scrollbar flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border bg-surface px-2 py-1.5 [padding-top:max(6px,env(safe-area-inset-top))]">
      <Link href="/library" aria-label="Back to Library" className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"><Ic n="back" /></Link>
      <Btn label="Contents and pages" on={() => toggle(p.panel === "outline" ? "thumbs" : "outline")} active={p.panel === "outline" || p.panel === "thumbs"}><Ic n="panel" s={15} /></Btn>
      <p className="mx-1 hidden min-w-0 max-w-64 truncate font-display text-[17px] lg:block" title={p.title}>{p.title}</p>
      <span className="flex-1" />
      <div className="flex shrink-0 items-center gap-1 text-[12.5px]">
        <Btn label="Previous page" on={() => p.goTo(p.page - 1, true)}><Ic n="up" s={15} /></Btn>
        <input aria-label="Page number" value={pageInput ?? String(p.page)} inputMode="numeric" onFocus={e => { setPageInput(String(p.page)); e.target.select(); }}
          onChange={e => setPageInput(e.target.value)} onBlur={() => setPageInput(null)}
          onKeyDown={e => { if (e.key === "Enter") { p.goTo(Number(pageInput) || p.page); (e.target as HTMLInputElement).blur(); } }}
          className="tabular h-7 w-11 rounded-full border border-border bg-surface text-center" />
        <span className="text-muted">/ {p.N}</span>
        <Btn label="Next page" on={() => p.goTo(p.page + 1, true)}><Ic n="down" s={15} /></Btn>
      </div>
      {sep}
      <Btn label="Zoom out (−)" on={() => p.setZoomScale(p.scale / 1.15)}><Ic n="minus" s={14} /></Btn>
      <button onClick={p.fit} title="Fit to width (0)" className={cn("tabular h-7 shrink-0 rounded-full px-2 text-[12.5px] text-muted hover:bg-surface-2", p.fitted && "text-fg underline underline-offset-4")}>{Math.round(p.scale * 100)}%</button>
      <Btn label="Zoom in (+)" on={() => p.setZoomScale(p.scale * 1.15)}><Ic n="plus" s={14} /></Btn>
      {sep}
      <Btn label="Search in book (Ctrl+F)" on={() => toggle("search")} active={p.panel === "search"}><Ic n="search" s={15} /></Btn>
      <Btn label="Highlights" on={() => toggle("highlights")} active={p.panel === "highlights"}><Ic n="highlight" s={15} /></Btn>
      <Btn label={p.bookmarked ? "Remove bookmark (B)" : "Bookmark this page (B)"} on={p.toggleBookmark} active={p.bookmarked}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill={p.bookmarked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden><path d="M6 3.5h12v17l-6-4-6 4z" /></svg>
      </Btn>
      <Btn label="Bookmarks" on={() => toggle("bookmarks")} active={p.panel === "bookmarks"}><Ic n="list" s={15} /></Btn>
      <Btn label={p.theme === "light" ? "Sepia pages" : p.theme === "sepia" ? "Night mode" : "Normal pages"} on={() => p.setTheme(p.theme === "light" ? "sepia" : p.theme === "sepia" ? "night" : "light")}>
        {p.theme === "night" ? <Ic n="moon" s={15} /> : p.theme === "sepia" ? <span className="size-3.5 rounded-full border border-[#8a6d3b] bg-[#f1e4c6]" /> : <Ic n="sun" s={15} />}
      </Btn>
      <Btn label={speaking ? "Stop reading" : "Read this page aloud"} on={() => void speak()} active={speaking}>{speaking ? <Ic n="stop" s={13} /> : <Ic n="speaker" s={15} />}</Btn>
      <Btn label="Full screen" className="hidden sm:grid" on={() => { if (document.fullscreenElement) void document.exitFullscreen(); else void p.rootEl.current?.requestFullscreen?.(); }}><Ic n="full" s={14} /></Btn>
      <Btn label="Download PDF" className="hidden sm:grid" on={() => { const a = document.createElement("a"); a.href = URL.createObjectURL(p.file); a.download = `${p.title}.pdf`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }}><Ic n="download" s={14} /></Btn>
    </header>
  );
}

function SelectionBar({ sel, title, create, onExplain, say }: { sel: Sel; title: string; create: (color: string, note?: string) => number; onExplain?: () => void; say: (t: string) => void }) {
  const [noting, setNoting] = useState(false);
  const [note, setNote] = useState("");
  const top = Math.min(window.innerHeight - (noting ? 150 : 60), sel.y + 10), left = Math.max(8, Math.min(window.innerWidth - 330, sel.x - 160));
  const ib = "grid size-7 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg";
  return (
    <div role="toolbar" aria-label="Highlight" className="fixed z-50 w-[320px] max-w-[calc(100vw-16px)] rounded-[14px] border border-border bg-surface p-1.5" style={{ top, left }}
      onMouseDown={e => { if (!(e.target as HTMLElement).closest("textarea")) e.preventDefault(); }}>
      <div className="flex items-center gap-1">
        {COLOR_KEYS.map(k => (
          <button key={k} title={`Highlight ${HL_NAMES[k]}`} aria-label={`Highlight ${HL_NAMES[k]}`} onClick={() => { if (create(k)) say("Highlighted"); }}
            className="size-6 shrink-0 rounded-full border-2 border-surface transition hover:scale-110" style={{ background: HL_COLORS[k] }} />
        ))}
        <span className="mx-0.5 h-5 w-px bg-border" />
        <button title="Add a note" aria-label="Add note" onClick={() => setNoting(true)} className={ib}><Ic n="note" s={14} /></button>
        <button title="Copy with page" aria-label="Copy" onClick={() => { void navigator.clipboard.writeText(`“${sel.text}” — ${title}, p. ${[...sel.texts.keys()][0]}`); say("Copied"); }} className={ib}><Ic n="copy" s={14} /></button>
        {onExplain && <button title="Explain with AI" aria-label="Explain with AI" onClick={onExplain} className={cn(ib, "text-gold")}><Ic n="spark" s={14} /></button>}
      </div>
      {noting && (
        <form className="mt-1.5" onSubmit={e => { e.preventDefault(); if (create("yellow", note.trim())) say("Highlight with note saved"); }}>
          <textarea autoFocus value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Your note…" aria-label="Note"
            className="w-full rounded-[10px] border border-border bg-surface px-2 py-1.5 text-[13px] outline-none focus:border-gold" />
          <div className="flex justify-end"><button type="submit" className="rounded-full bg-primary px-3 py-1 text-[12.5px] font-medium text-on-primary">Save</button></div>
        </form>
      )}
    </div>
  );
}

function HighlightEditor({ hl, x, y, title, update, remove, onClose, say }: { hl: Highlight; x: number; y: number; title: string; update: (p: Partial<Highlight>) => void; remove: () => void; onClose: () => void; say: (t: string) => void }) {
  const [note, setNote] = useState(hl.note ?? "");
  const top = Math.min(window.innerHeight - 230, y + 12), left = Math.max(8, Math.min(window.innerWidth - 300, x - 140));
  return (
    <div className="fixed z-50 w-[290px] max-w-[calc(100vw-16px)] rounded-[14px] border border-border bg-surface p-3" style={{ top, left }} onClick={e => e.stopPropagation()}>
      <div className="mb-2 flex items-center gap-1">
        {COLOR_KEYS.map(k => (
          <button key={k} aria-label={`Change to ${HL_NAMES[k]}`} title={HL_NAMES[k]} onClick={() => update({ color: k })}
            className={cn("size-6 rounded-full border-2", hl.color === k ? "border-fg" : "border-transparent")} style={{ background: HL_COLORS[k] }} />
        ))}
        <span className="flex-1" />
        <button onClick={onClose} aria-label="Close" className="text-muted hover:text-fg"><Ic n="x" s={14} /></button>
      </div>
      <p className="mb-2 line-clamp-3 border-l-2 pl-2 font-display text-[14px] leading-snug" style={{ borderColor: HL_COLORS[hl.color] }}>{hl.text}</p>
      <textarea value={note} onChange={e => setNote(e.target.value)} onBlur={() => note !== (hl.note ?? "") && update({ note: note.trim() })}
        rows={2} placeholder="Add a note…" aria-label="Highlight note" className="w-full rounded-[10px] border border-border bg-surface px-2 py-1.5 text-[13px] outline-none focus:border-gold" />
      <div className="mt-2 flex items-center gap-1 text-[12px]">
        <button onClick={() => { void navigator.clipboard.writeText(`“${hl.text}” — ${title}, p. ${hl.page}`); say("Copied"); }} className="flex items-center gap-1 rounded-full px-2 py-1 text-muted hover:bg-surface-2"><Ic n="copy" s={12} /> Copy</button>
        <span className="flex-1" />
        <button onClick={remove} className="flex items-center gap-1 rounded-full px-2 py-1 text-danger hover:bg-surface-2"><Ic n="trash" s={12} /> Delete</button>
      </div>
    </div>
  );
}

function SidePanel(p: {
  panel: Panel; setPanel: (x: Panel | null) => void; pdf: PDFDocumentProxy; book: BookDoc; hls: Highlight[]; page: number; goTo: (n: number) => void;
  pageText: (n: number) => Promise<string>; query: Query; setQuery: (q: Query) => void; flash: (id: string) => void;
  bookmarks: number[]; removeBookmark: (n: number) => void; ask: { id: number; prompt: string; label: string } | null;
  setAsk: (a: { id: number; prompt: string; label: string } | null) => void; explain?: (prompt: string) => Promise<string>; sectionOf: (n: number) => string; say: (t: string) => void;
}) {
  const tabs: [Panel, string][] = [["outline", "Contents"], ["thumbs", "Pages"], ["highlights", "Highlights"], ["bookmarks", "Bookmarks"], ["search", "Search"], ...(p.explain ? [["explain", "Explain"]] as [Panel, string][] : [])];
  return (
    <>
      <div className="flex shrink-0 flex-wrap items-center gap-0.5 border-b border-border px-2 py-1.5">
        {tabs.map(([k, l]) => <button key={k} onClick={() => p.setPanel(k)} className={cn("shrink-0 rounded-full px-2.5 py-1 text-[12.5px]", p.panel === k ? "bg-surface-2 font-medium" : "text-muted hover:text-fg")}>{l}</button>)}
        <span className="flex-1" />
        <button onClick={() => p.setPanel(null)} aria-label="Close panel" className="text-muted hover:text-fg"><Ic n="x" s={14} /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {p.panel === "outline" && <Outline pdf={p.pdf} goTo={p.goTo} onEmpty={() => p.setPanel("thumbs")} />}
        {p.panel === "thumbs" && <Thumbs pdf={p.pdf} page={p.page} goTo={p.goTo} />}
        {p.panel === "highlights" && <HlList book={p.book} hls={p.hls} sectionOf={p.sectionOf} goTo={h => { p.goTo(h.page); p.flash(h.id); }} say={p.say} />}
        {p.panel === "bookmarks" && <Bookmarks bookmarks={p.bookmarks} goTo={p.goTo} pageText={p.pageText} remove={p.removeBookmark} />}
        {p.panel === "search" && <SearchPanel N={p.pdf.numPages} pageText={p.pageText} goTo={p.goTo} query={p.query} setQuery={p.setQuery} />}
        {p.panel === "explain" && p.explain && <ExplainPanel book={p.book} page={p.page} pageText={p.pageText} ask={p.ask} setAsk={p.setAsk} explain={p.explain} />}
      </div>
    </>
  );
}

interface OutlineItem { title: string; dest: string | unknown[] | null; items: OutlineItem[] }
function Outline({ pdf, goTo, onEmpty }: { pdf: PDFDocumentProxy; goTo: (n: number) => void; onEmpty: () => void }) {
  const [items, setItems] = useState<OutlineItem[] | null>(null);
  useEffect(() => { void pdf.getOutline().then(o => { setItems((o ?? []) as OutlineItem[]); if (!o?.length) onEmpty(); }); }, [pdf, onEmpty]);
  const open = async (dest: OutlineItem["dest"]) => {
    try {
      const d = typeof dest === "string" ? await pdf.getDestination(dest) : dest;
      if (!d?.length) return;
      const ref = d[0];
      goTo((typeof ref === "number" ? ref : await pdf.getPageIndex(ref as Parameters<PDFDocumentProxy["getPageIndex"]>[0])) + 1);
    } catch {}
  };
  if (!items) return <div className="grid place-items-center py-8"><div className="orb size-6" aria-label="Loading" /></div>;
  if (!items.length) return <p className="p-4 text-[12.5px] text-muted">This PDF has no table of contents.</p>;
  const render = (list: OutlineItem[], depth: number): React.ReactNode => list.map((it, i) => (
    <div key={`${depth}:${i}`}>
      <button onClick={() => void open(it.dest)} className="block w-full truncate rounded-[8px] px-2 py-1 text-left text-[13px] hover:bg-surface-2" style={{ paddingLeft: 8 + depth * 12 }} title={it.title}>{it.title}</button>
      {it.items?.length ? render(it.items, depth + 1) : null}
    </div>
  ));
  return <div className="p-1.5">{render(items, 0)}</div>;
}

function Thumbs({ pdf, page, goTo }: { pdf: PDFDocumentProxy; page: number; goTo: (n: number) => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.querySelector(`[data-thumb="${page}"]`)?.scrollIntoView({ block: "nearest" }); }, [page]);
  return <div ref={box} className="grid grid-cols-2 gap-3 p-3">{Array.from({ length: pdf.numPages }, (_, i) => <Thumb key={i} pdf={pdf} n={i + 1} active={page === i + 1} onClick={() => goTo(i + 1)} />)}</div>;
}
function Thumb({ pdf, n, active, onClick }: { pdf: PDFDocumentProxy; n: number; active: boolean; onClick: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    let done = false;
    const io = new IntersectionObserver(async ([e]) => {
      if (!e.isIntersecting || done) return;
      done = true; io.disconnect();
      const pg = await pdf.getPage(n), v = pg.getViewport({ scale: 220 / pg.getViewport({ scale: 1 }).width });
      c.width = v.width; c.height = v.height;
      await pg.render({ canvasContext: c.getContext("2d")!, canvas: c, viewport: v } as Parameters<typeof pg.render>[0]).promise.catch(() => {});
    }, { rootMargin: "200px" });
    io.observe(c);
    return () => io.disconnect();
  }, [pdf, n]);
  return (
    <button data-thumb={n} onClick={onClick} className="text-center">
      <canvas ref={ref} className={cn("aspect-[3/4] w-full bg-white object-contain ring-1 ring-black/10", active && "ring-2 ring-gold")} />
      <span className={cn("text-[11px]", active ? "font-semibold text-fg" : "text-muted")}>{n}</span>
    </button>
  );
}

function HlList({ book, hls, sectionOf, goTo, say }: { book: BookDoc; hls: Highlight[]; sectionOf: (n: number) => string; goTo: (h: Highlight) => void; say: (t: string) => void }) {
  const [color, setColor] = useState<string | null>(null);
  const [fmt, setFmt] = useState<ExportFormat>("docx");
  const list = [...hls].filter(h => !color || h.color === color).sort((a, b) => a.page - b.page || a.at - b.at);
  const items: ExportItem[] = list.map(h => ({ kind: "highlight", text: h.text, note: h.note, color: h.color, page: h.page, at: h.at, section: sectionOf(h.page) }));
  return (
    <div className="p-2">
      <div className="mb-2 flex flex-wrap gap-1 px-1">
        {COLOR_KEYS.map(k => <button key={k} aria-label={`Only ${HL_NAMES[k]}`} onClick={() => setColor(color === k ? null : k)} className={cn("size-5 rounded-full border-2", color === k ? "border-fg" : "border-transparent")} style={{ background: HL_COLORS[k] }} />)}
      </div>
      {!list.length ? <p className="p-2 text-[12.5px] text-muted">Select text on a page and choose a colour to highlight it.</p> : (
        <>
          {list.map(h => (
            <button key={h.id} onClick={() => goTo(h)} className="mb-1 flex w-full gap-2 rounded-[10px] p-2 text-left hover:bg-surface-2">
              <span className="w-1 shrink-0 rounded-full" style={{ background: HL_COLORS[h.color] }} />
              <span className="min-w-0 flex-1">
                <span className="line-clamp-3 font-display text-[14px] leading-snug">{h.text}</span>
                {h.note && <span className="mt-0.5 block truncate text-[11.5px] text-muted">✎ {h.note}</span>}
                <span className="text-[10.5px] text-muted">p. {h.page}</span>
              </span>
            </button>
          ))}
          <div className="mt-2 flex items-center gap-1.5 border-t border-border px-1 pt-2">
            <label htmlFor="pdf-exp" className="sr-only">Export format</label>
            <select id="pdf-exp" value={fmt} onChange={e => setFmt(e.target.value as ExportFormat)} className="rounded-full border border-border bg-surface px-2 py-1 text-[12.5px]">
              <option value="docx">Word</option><option value="pdf">PDF</option><option value="md">Markdown</option>
            </select>
            <button onClick={() => void downloadExport({ title: book.title, author: book.author }, items, fmt).then(n => say(`Saved “${n}”`))}
              className="flex-1 rounded-full border border-border px-3 py-1 text-[12.5px] font-medium hover:bg-surface-2">Export {items.length} highlight{items.length === 1 ? "" : "s"}</button>
          </div>
        </>
      )}
    </div>
  );
}

function Bookmarks({ bookmarks, goTo, pageText, remove }: { bookmarks: number[]; goTo: (n: number) => void; pageText: (n: number) => Promise<string>; remove: (n: number) => void }) {
  const [snips, setSnips] = useState<Record<number, string>>({});
  useEffect(() => {
    let alive = true;
    void Promise.all(bookmarks.map(async n => [n, (await pageText(n)).replace(/\s+/g, " ").trim().slice(0, 90)] as const)).then(r => alive && setSnips(Object.fromEntries(r)));
    return () => { alive = false; };
  }, [bookmarks, pageText]);
  if (!bookmarks.length) return <p className="p-4 text-[12.5px] text-muted">No bookmarks yet. Press <b>B</b> or the bookmark button to mark a page.</p>;
  return (
    <div className="p-2">
      {bookmarks.map(n => (
        <div key={n} className="group flex items-start gap-2 rounded-[10px] p-2 hover:bg-surface-2">
          <button onClick={() => goTo(n)} className="min-w-0 flex-1 text-left"><span className="text-[12.5px] font-medium">Page {n}</span><span className="block truncate text-[11.5px] text-muted">{snips[n] ?? "…"}</span></button>
          <button aria-label={`Remove bookmark ${n}`} onClick={() => remove(n)} className="text-muted hover:text-danger"><Ic n="x" s={13} /></button>
        </div>
      ))}
    </div>
  );
}

function SearchPanel({ N, pageText, goTo, query, setQuery }: { N: number; pageText: (n: number) => Promise<string>; goTo: (n: number) => void; query: Query; setQuery: (q: Query) => void }) {
  const [q, setQ] = useState(query.text);
  const [results, setResults] = useState<{ page: number; idx: number; snippet: string }[] | null>(null);
  const [busy, setBusy] = useState(0);
  const run = async (term: string) => {
    const t = term.trim();
    if (t.length < 2) { setResults(null); setQuery({ text: "", page: null, idx: 0 }); clearSearchHighlights(); return; }
    setResults([]); setQuery({ text: t, page: null, idx: 0 });
    const out: { page: number; idx: number; snippet: string }[] = [], needle = t.toLowerCase();
    for (let n = 1; n <= N; n++) {
      const text = await pageText(n), hay = text.toLowerCase();
      let k = 0;
      for (let i = hay.indexOf(needle); i !== -1 && out.length < 500; i = hay.indexOf(needle, i + needle.length), k++) out.push({ page: n, idx: k, snippet: text.slice(Math.max(0, i - 40), i + t.length + 50).replace(/\s+/g, " ") });
      if (n % 20 === 0 || n === N) { setResults([...out]); setBusy(n / N); }
    }
    setBusy(0);
  };
  return (
    <div className="p-2">
      <form onSubmit={e => { e.preventDefault(); void run(q); }} className="mb-2 flex gap-1">
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Find in this book" aria-label="Find in book" className="h-8 min-w-0 flex-1 rounded-full border border-border bg-surface px-3 text-[13px] outline-none focus:border-gold" />
        <button type="submit" className="rounded-full border border-border px-3 text-[12.5px] font-medium hover:bg-surface-2">Find</button>
      </form>
      {busy > 0 && busy < 1 && <p className="px-1 pb-1 text-[11.5px] text-muted">Searching… {Math.round(busy * 100)}%</p>}
      {results && <p className="px-1 pb-1 text-[11.5px] text-muted">{results.length}{results.length >= 500 ? "+" : ""} match{results.length === 1 ? "" : "es"}</p>}
      {results?.map((r, i) => {
        const at = r.snippet.toLowerCase().indexOf(query.text.toLowerCase());
        return (
          <button key={i} onClick={() => { setQuery({ text: query.text, page: r.page, idx: r.idx }); goTo(r.page); }}
            className={cn("mb-0.5 block w-full rounded-[8px] px-2 py-1.5 text-left text-[12.5px] hover:bg-surface-2", query.page === r.page && query.idx === r.idx && "bg-[var(--gold-soft)]")}>
            <span className="mr-1 text-[10.5px] font-semibold text-muted">p. {r.page}</span>
            {at >= 0 ? <>{r.snippet.slice(0, at)}<mark className="rounded bg-[#F6D55C] text-black">{r.snippet.slice(at, at + query.text.length)}</mark>{r.snippet.slice(at + query.text.length)}</> : r.snippet}
          </button>
        );
      })}
    </div>
  );
}

/** Explain a selection, summarise the page, or ask about it, with the person's own Gemini key. */
function ExplainPanel({ book, page, pageText, ask, setAsk, explain }: {
  book: BookDoc; page: number; pageText: (n: number) => Promise<string>; ask: { id: number; prompt: string; label: string } | null;
  setAsk: (a: { id: number; prompt: string; label: string } | null) => void; explain: (prompt: string) => Promise<string>;
}) {
  const [q, setQ] = useState("");
  const [out, setOut] = useState<{ id: number; text: string; busy: boolean; error?: string } | null>(null);
  useEffect(() => {
    if (!ask) return;
    let alive = true;
    void (async () => {
      setOut({ id: ask.id, text: "", busy: true });
      try { const text = await explain(ask.prompt); if (alive) setOut({ id: ask.id, text, busy: false }); }
      catch (e) { if (alive) setOut({ id: ask.id, text: "", busy: false, error: (e as Error).message === "quota" ? "Your Gemini key has reached its limit for now." : "Couldn't get an answer. Try again." }); }
    })();
    return () => { alive = false; };
  }, [ask, explain]);
  const aboutPage = async (question?: string) => {
    const text = (await pageText(page)).trim();
    if (!text) { setOut({ id: Date.now(), text: "", busy: false, error: "This page has no selectable text (it may be a scanned image)." }); return; }
    setAsk({ id: Date.now(), label: question ?? `Page ${page}`, prompt: question
      ? `Answer this question about page ${page} of "${book.title}" by ${book.author}, using the page's text. Be brief and plain. Question: ${question}\nPage text: """${text.slice(0, 6000)}"""`
      : `Summarise page ${page} of "${book.title}" by ${book.author} in 3 to 5 short bullet points, in plain English.\nPage text: """${text.slice(0, 6000)}"""` });
  };
  return (
    <div className="flex flex-col gap-3 p-3">
      <button onClick={() => void aboutPage()} className="rounded-full border border-border px-3 py-1.5 text-[13px] font-medium hover:bg-surface-2">Summarise page {page}</button>
      <form onSubmit={e => { e.preventDefault(); if (q.trim()) { void aboutPage(q.trim()); setQ(""); } }} className="flex gap-1">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={`Ask about page ${page}…`} aria-label="Ask about this page" className="h-8 min-w-0 flex-1 rounded-full border border-border bg-surface px-3 text-[13px] outline-none focus:border-gold" />
        <button type="submit" className="rounded-full border border-border px-3 text-[12.5px] font-medium hover:bg-surface-2">Ask</button>
      </form>
      <p className="text-[11.5px] text-muted">Tip: select text and tap ✦ to have it explained.</p>
      {ask && <p className="line-clamp-3 border-l-2 border-gold pl-2 font-display text-[14px] text-muted">{ask.label}</p>}
      {out && (out.busy ? <p className="text-[13px] text-muted" role="status">Thinking…</p> : out.error ? <p className="text-[13px] text-danger" role="alert">{out.error}</p> : <p className="whitespace-pre-line text-[14px] leading-relaxed">{out.text}</p>)}
    </div>
  );
}
