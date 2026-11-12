"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import type { Shelf } from "@/lib/model";
import { addClassic, ImportError, importFile, searchClassics, type Classic } from "@/lib/books/library";
import { useStore } from "@/lib/store/store";
import { BookCard, Cover, EmptyShelf, TodaysReading } from "@/components/books";
import { Button, Card, PageTitle, Pill, SectionTitle } from "@/components/ui";

type Tab = Shelf | "highlights";
const TABS: [Tab, string][] = [["active", "Currently reading"], ["reserve", "Reserve"], ["finished", "Finished"], ["highlights", "Highlights"]];
const COLORS: Record<string, string> = { yellow: "#F6D55C", green: "#8ED081", blue: "#8EC5F0", pink: "#F4A3C8", orange: "#F7B267", purple: "#C3A6F2", teal: "#7FD6CB", red: "#F28B82" };

export default function Library() {
  const s = useStore();
  const lib = s.get("library") ?? [];
  const reading = s.get("reading") ?? {};
  const [tab, setTab] = useState<Tab>("active");
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Classic[] | null>(null);
  const [adding, setAdding] = useState<number | null>(null);
  const file = useRef<HTMLInputElement>(null);

  async function upload(f: File) {
    setProblem(null); setBusy("Reading the book…");
    try { await importFile(f, setBusy); setTab("active"); }
    catch (e) { setProblem(e instanceof ImportError ? e.message : "Lumen couldn't add this book. Try again."); }
    finally { setBusy(null); if (file.current) file.current.value = ""; }
  }
  async function find(e: React.FormEvent) {
    e.preventDefault(); if (q.trim().length < 2) return;
    setProblem(null); setHits(null); setBusy("Searching Project Gutenberg…");
    try { setHits(await searchClassics(q.trim())); } catch (err) { setProblem((err as Error).message); } finally { setBusy(null); }
  }
  async function add(c: Classic) {
    setAdding(c.id); setProblem(null);
    try { await addClassic(c); } catch (e) { setProblem(e instanceof ImportError ? e.message : "Couldn't download the book."); } finally { setAdding(null); }
  }

  const shelf = tab === "highlights" ? [] : lib.filter(b => b.shelf === tab);
  const marks = lib.flatMap(b => {
    const r = reading[b.id];
    if (!r) return [];
    return [...r.hl.map(h => ({ book: b, kind: "highlight" as const, text: h.text, note: h.note, color: h.color, page: h.page, at: h.at, id: h.id })), ...r.notes.map(n => ({ book: b, kind: "note" as const, text: n.text, note: "", color: "", page: n.page, at: n.at, id: n.id }))];
  }).sort((a, b) => b.at - a.at);

  return (
    <>
      <PageTitle title="Library" sub="Your books, read like a real book. Saved in your Drive and on this device." />

      <div className="flex flex-col gap-3.5 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-8">
        <div className="flex flex-col gap-3.5">
          <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Shelves">
            {TABS.map(([k, l]) => <Pill key={k} role="tab" aria-selected={tab === k} on={tab === k} onClick={() => setTab(k)} className="shrink-0">{l}{k !== "highlights" ? ` · ${lib.filter(b => b.shelf === k).length}` : ` · ${marks.length}`}</Pill>)}
          </div>

          {tab !== "highlights" ? (
            <Card>
              {shelf.length ? (
                <div className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 lg:grid-cols-5">{shelf.map(b => <BookCard key={b.id} book={b} />)}</div>
              ) : (
                <EmptyShelf text={tab === "active" ? "No book on the go. Add one below, or move one here from Reserve." : tab === "reserve" ? "Books waiting their turn appear here. When you finish one, today's reading starts the next." : "Books you finish will be kept here."} />
              )}
            </Card>
          ) : (
            <Card className="flex flex-col">
              {marks.length === 0 && <EmptyShelf text="No highlights yet. In any book, select words to highlight them in one of 8 colours, or add a note to a page." />}
              {marks.slice(0, 60).map(m => (
                <div key={m.id} className="flex flex-col gap-1.5 border-t border-border py-3 pl-3 first:border-t-0" style={{ borderLeft: `3px solid ${m.kind === "highlight" ? COLORS[m.color] ?? "var(--gold)" : "var(--gold)"}` }}>
                  {m.kind === "highlight" && <p className="font-display text-[17px] leading-snug">“{m.text}”</p>}
                  {(m.note || m.kind === "note") && <p className="rounded-[8px] bg-surface-2 px-2.5 py-1.5 text-[13.5px]">{m.kind === "note" ? m.text : m.note}</p>}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted">
                    <span>{m.book.title} · page {m.page}</span>
                    <span className="flex gap-3"><Link className="underline underline-offset-2" href={`/read/${m.book.id}?sheet=notes`}>Open</Link><Link className="underline underline-offset-2" href={`/read/${m.book.id}?sheet=export`}>Export this book&apos;s notes</Link></span>
                  </div>
                </div>
              ))}
            </Card>
          )}

          <SectionTitle>Free classics</SectionTitle>
          <Card className="flex flex-col gap-3">
            <form onSubmit={find} className="flex gap-2">
              <label htmlFor="classic-q" className="sr-only">Search free classics</label>
              <input id="classic-q" value={q} onChange={e => setQ(e.target.value)} placeholder="Search Project Gutenberg, e.g. Seneca, habits, Franklin" className="min-w-0 flex-1 rounded-[10px] border border-border bg-surface px-3 py-2 text-[14px]" />
              <Button size="sm" type="submit" disabled={q.trim().length < 2 || !!busy}>Search</Button>
            </form>
            <p className="text-[12.5px] text-muted">Over 70,000 public-domain books, free to download and keep.</p>
            {hits && hits.length === 0 && <p className="text-[13.5px] text-muted">No free books matched. Try an author&apos;s name.</p>}
            {hits && hits.length > 0 && (
              <div className="lg:grid lg:grid-cols-2 lg:gap-x-6">
                {hits.map(h => {
                  const have = lib.some(b => b.gutenbergId === h.id);
                  return (
                    <div key={h.id} className="flex items-center gap-3 border-t border-border py-2.5">
                      <Cover book={{ title: h.title, author: h.author, cover: h.cover }} className="w-[44px]" />
                      <div className="min-w-0 flex-1"><p className="line-clamp-2 text-[14px] font-medium leading-snug">{h.title}</p><p className="truncate text-[12px] text-muted">{h.author}</p></div>
                      {have ? <span className="text-[12.5px] text-[var(--lang)]">On your shelf</span> : <Button size="sm" variant="ghost" disabled={adding != null} onClick={() => add(h)}>{adding === h.id ? "Downloading…" : "Download"}</Button>}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        <aside className="flex flex-col gap-3.5 lg:sticky lg:top-24">
          <SectionTitle right="From where you stopped">Today&apos;s reading</SectionTitle>
          <TodaysReading />
          <SectionTitle>Add a book</SectionTitle>
          <Card className="flex flex-col gap-2.5">
            <p className="text-[13.5px] text-muted">EPUB or PDF files you own. They&apos;re saved in the Books folder of your Lumen Drive folder and read here with highlights, notes and bookmarks.</p>
            <input ref={file} type="file" accept=".epub,.pdf,application/epub+zip,application/pdf" className="sr-only" id="book-file" onChange={e => e.target.files?.[0] && upload(e.target.files[0])} />
            <label htmlFor="book-file" className="inline-flex min-h-9 cursor-pointer items-center justify-center self-start rounded-full bg-primary px-4 text-[14px] font-medium text-on-primary hover:opacity-90">Upload a book</label>
            {busy && <p role="status" className="text-[13px] text-muted">{busy}</p>}
            {problem && <p role="alert" className="text-[13px] text-danger">{problem}</p>}
          </Card>
        </aside>
      </div>
    </>
  );
}
