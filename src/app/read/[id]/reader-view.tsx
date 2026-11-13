"use client";
import "../reader.css";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createReader } from "@/lib/reader/engine";
import { bookOriginal, loadBook } from "@/lib/books/library";
import { generate } from "@/lib/gemini";
import { store, useStore } from "@/lib/store/store";
import type { ReadingState } from "@/lib/model";

type PdfDoc = { getPage(n: number): Promise<{ getViewport(o: { scale: number }): { width: number; height: number }; render(o: unknown): { promise: Promise<void> } }> };

/** The page's own paper colour: the most common colour along its edges (a title band or picture at one edge doesn't decide it). */
function paperColour(ctx: CanvasRenderingContext2D, w: number, h: number): string {
  const seen = new Map<string, number>();
  for (let i = 1; i <= 9; i++) {
    for (const [x, y] of [[3, (h * i) / 10], [w - 4, (h * i) / 10], [(w * i) / 10, h - 4], [(w * i) / 10, 3]]) {
      const d = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
      const key = `rgb(${d[0] & 0xf8},${d[1] & 0xf8},${d[2] & 0xf8})`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
  }
  return [...seen.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "#fff";
}

/**
 * Draws a real PDF page as an image at the size it will be shown (sharp on high-density
 * screens), and reports the page's own paper colour so the space around it matches.
 */
function pageRenderer(id: string) {
  let doc: Promise<PdfDoc | null> | null = null;
  const done = new Map<string, Promise<{ url: string; bg: string } | null>>();
  const load = () => (doc ??= (async () => {
    const blob = await bookOriginal(id);
    if (!blob) return null;
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
    return (await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), cMapUrl: "/pdfjs/cmaps/", cMapPacked: true, standardFontDataUrl: "/pdfjs/standard_fonts/" }).promise) as unknown as PdfDoc;
  })());
  const urls: string[] = [];
  return {
    render(n: number, cssWidth: number) {
      const w = Math.round(cssWidth), key = `${n}@${w}`;
      if (!done.has(key)) done.set(key, (async () => {
        const pdf = await load(); if (!pdf) return null;
        const page = await pdf.getPage(n), base = page.getViewport({ scale: 1 });
        const scale = (w * Math.min(window.devicePixelRatio || 1, 2.5)) / base.width, vp = page.getViewport({ scale });
        const c = document.createElement("canvas"); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
        const ctx = c.getContext("2d")!;
        await page.render({ canvasContext: ctx, viewport: vp, canvas: c }).promise;
        const bg = paperColour(ctx, c.width, c.height);
        const blob = await new Promise<Blob | null>(r => c.toBlob(r, "image/jpeg", 0.9));
        if (!blob) return null;
        const url = URL.createObjectURL(blob); urls.push(url);
        return { url, bg };
      })().catch(() => null));
      return done.get(key)!;
    },
    dispose() { urls.forEach(u => URL.revokeObjectURL(u)); },
  };
}

/** The book reader, full screen. Your place, highlights and notes save as you read. */
export function ReaderView({ id }: { id: string }) {
  const router = useRouter();
  const s = useStore();
  const root = useRef<HTMLDivElement>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => { store.init(); }, []);

  useEffect(() => {
    if (!s.loaded || !root.current) return;
    const reader = createReader();
    const pages = pageRenderer(id);
    let gone = false;
    (async () => {
      const book = await loadBook(id).catch(() => null);
      if (gone) return;
      if (!book) { setMissing(true); return; }
      const sheet = new URLSearchParams(window.location.search).get("sheet") as "notes" | "export" | null;
      const key = store.get("ai")?.mode === "own" ? store.get("ai")?.key : undefined;
      await reader.open({
        root: root.current!, book, sheet: sheet ?? undefined,
        renderPage: book.layout === "fixed" ? pages.render : undefined,
        state: store.get("reading")?.[id], settings: store.get("readerSettings"),
        explain: key ? (prompt: string) => generate(key, prompt).catch(e => { throw new Error(e?.reason === "quota" ? "quota" : "ai"); }) : undefined,
        onSave: (bookId: string, state: ReadingState, settings) => {
          store.update("reading", r => ({ ...(r ?? {}), [bookId]: state }));
          store.set("readerSettings", settings);
          if (state.at) store.update("library", lib => (lib ?? []).map(b => (b.id === bookId ? { ...b, at: state.at, lastReadAt: Date.now() } : b)));
        },
        onClose: () => router.push("/library"),
      });
    })();
    return () => { gone = true; reader.destroy(); pages.dispose(); };
  }, [s.loaded, id, router]);

  if (missing) return (
    <main className="mx-auto flex max-w-[460px] flex-col gap-3 px-4 pt-16 text-center">
      <h1 className="text-[30px]">Book not found</h1>
      <p className="text-muted">It may have been removed, or it&apos;s still syncing from your Drive.</p>
      <Link href="/library" className="mx-auto rounded-full bg-primary px-4 py-2 text-[14px] font-medium text-on-primary">Back to Library</Link>
    </main>
  );
  return <div id="reader" ref={root} className="fixed inset-0 z-40" aria-label="Book reader" />;
}
