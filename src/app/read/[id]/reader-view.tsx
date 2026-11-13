"use client";
import "../reader.css";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createReader } from "@/lib/reader/engine";
import { bookOriginal, loadBook } from "@/lib/books/library";
import { generate } from "@/lib/gemini";
import { store, useStore } from "@/lib/store/store";
import type { BookDoc, ReadingState } from "@/lib/model";
import { PdfReader } from "@/components/pdf/pdf-reader";

const explainWith = (key: string | undefined) =>
  key ? (prompt: string) => generate(key, prompt).catch(e => { throw new Error(e?.reason === "quota" ? "quota" : "ai"); }) : undefined;

/** The reader, full screen. PDFs open in the PDF reader (real pages, continuous scroll); other books in the book reader. */
export function ReaderView({ id }: { id: string }) {
  const s = useStore();
  const [pdf, setPdf] = useState<{ book: BookDoc; doc: PDFDocumentProxy; file: Blob } | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => { store.init(); }, []);
  const isPdf = s.loaded ? s.get("library")?.find(b => b.id === id)?.format === "pdf" : null;

  useEffect(() => {
    if (!isPdf) return;
    let alive = true, doc: PDFDocumentProxy | null = null;
    void (async () => {
      const [book, file] = await Promise.all([loadBook(id).catch(() => null), bookOriginal(id).catch(() => null)]);
      if (!alive) return;
      if (!book || !file) { setMissing(true); return; }
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
      doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), cMapUrl: "/pdfjs/cmaps/", cMapPacked: true, standardFontDataUrl: "/pdfjs/standard_fonts/" }).promise;
      if (!alive) { void doc.destroy(); return; }
      setPdf({ book, doc, file });
    })().catch(() => alive && setMissing(true));
    return () => { alive = false; void doc?.destroy(); };
  }, [isPdf, id]);

  if (missing) return <Missing />;
  if (isPdf === false) return <BookReader id={id} />;
  if (isPdf && pdf) {
    const sheet = new URLSearchParams(window.location.search).get("sheet");
    const key = store.get("ai")?.mode === "own" ? store.get("ai")?.key : undefined;
    return <PdfReader pdf={pdf.doc} book={pdf.book} file={pdf.file} explain={explainWith(key)} startPanel={sheet === "notes" || sheet === "export" ? "highlights" : null} />;
  }
  return <main className="grid min-h-dvh place-items-center"><div className="orb size-12" aria-label="Opening the book" /></main>;
}

function Missing() {
  return (
    <main className="mx-auto flex max-w-[460px] flex-col gap-3 px-4 pt-16 text-center">
      <h1 className="text-[30px]">Book not found</h1>
      <p className="text-muted">It may have been removed, or it&apos;s still syncing from your Drive.</p>
      <Link href="/library" className="mx-auto rounded-full bg-primary px-4 py-2 text-[14px] font-medium text-on-primary">Back to Library</Link>
    </main>
  );
}

/** EPUBs and free classics: the book-style reader. */
function BookReader({ id }: { id: string }) {
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    if (!root.current) return;
    const reader = createReader();
    let gone = false;
    (async () => {
      const book = await loadBook(id).catch(() => null);
      if (gone) return;
      if (!book) { setMissing(true); return; }
      const sheet = new URLSearchParams(window.location.search).get("sheet") as "notes" | "export" | null;
      const key = store.get("ai")?.mode === "own" ? store.get("ai")?.key : undefined;
      await reader.open({
        root: root.current!, book, sheet: sheet ?? undefined,
        state: store.get("reading")?.[id], settings: store.get("readerSettings"),
        explain: explainWith(key),
        onSave: (bookId: string, state: ReadingState, settings) => {
          store.update("reading", r => ({ ...(r ?? {}), [bookId]: state }));
          store.set("readerSettings", { ...(store.get("readerSettings") ?? {}), ...settings });
          if (state.at) store.update("library", lib => (lib ?? []).map(b => (b.id === bookId ? { ...b, at: state.at, lastReadAt: Date.now() } : b)));
        },
        onClose: () => router.push("/library"),
      });
    })();
    return () => { gone = true; reader.destroy(); };
  }, [id, router]);
  if (missing) return <Missing />;
  return <div id="reader" ref={root} className="fixed inset-0 z-40" aria-label="Book reader" />;
}
