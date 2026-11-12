"use client";
import "../reader.css";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createReader } from "@/lib/reader/engine";
import { loadBook } from "@/lib/books/library";
import { generate } from "@/lib/gemini";
import { store, useStore } from "@/lib/store/store";
import type { ReadingState } from "@/lib/model";

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
        explain: key ? (prompt: string) => generate(key, prompt).catch(e => { throw new Error(e?.reason === "quota" ? "quota" : "ai"); }) : undefined,
        onSave: (bookId: string, state: ReadingState, settings) => {
          store.update("reading", r => ({ ...(r ?? {}), [bookId]: state }));
          store.set("readerSettings", settings);
          if (state.at) store.update("library", lib => (lib ?? []).map(b => (b.id === bookId ? { ...b, at: state.at, lastReadAt: Date.now() } : b)));
        },
        onClose: () => router.push("/library"),
      });
    })();
    return () => { gone = true; reader.destroy(); };
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
