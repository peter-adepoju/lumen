"use client";
import Link from "next/link";
import { useState } from "react";
import type { LibraryEntry, Shelf } from "@/lib/model";
import { moveBook, readingPlan, removeBook, todaysBook } from "@/lib/books/library";
import { today } from "@/lib/recs";
import { useStore } from "@/lib/store/store";
import { Button, Card, cn, SectionTitle } from "./ui";

export function Cover({ book, className }: { book: Pick<LibraryEntry, "title" | "author" | "cover">; className?: string }) {
  return (
    <span className={cn("relative block aspect-[2/3] shrink-0 overflow-hidden rounded-[4px] bg-surface-2 shadow-[0_2px_10px_rgba(0,0,0,.16)]", className)}>
      {book.cover ? <img src={book.cover} alt="" loading="lazy" className="size-full object-cover" />
        : <span className="flex size-full flex-col justify-between bg-[linear-gradient(160deg,var(--gold)_0%,var(--primary)_100%)] p-2 text-[#F7F5F0]"><span className="font-display text-[14px] leading-tight">{book.title}</span><span className="text-[9.5px] opacity-80">{book.author}</span></span>}
    </span>
  );
}

const SHELF_NAME: Record<Shelf, string> = { active: "Currently reading", reserve: "Reserve", finished: "Finished" };

export function BookCard({ book }: { book: LibraryEntry }) {
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const pct = book.at?.pct ?? 0;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Link href={`/read/${book.id}`} className="relative block" aria-label={`Read ${book.title}`}>
        <Cover book={book} />
        {book.shelf === "active" && <span className="absolute inset-x-0 bottom-0 h-1 bg-black/40"><span className="block h-full bg-danger" style={{ width: `${pct}%` }} /></span>}
      </Link>
      <div className="flex items-start gap-1">
        <Link href={`/read/${book.id}`} className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[13px] font-medium leading-snug">{book.title}</p>
          <p className="truncate text-[11.5px] text-muted">{book.shelf === "finished" ? "Finished" : book.at ? `Page ${book.at.page} of ${book.at.total} · ${pct}%` : book.author}</p>
        </Link>
        <button aria-label={`Options for ${book.title}`} aria-expanded={menu} onClick={() => { setMenu(m => !m); setConfirm(false); }} className="grid size-7 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2">⋯</button>
      </div>
      {menu && (
        <div className="flex flex-col gap-1 rounded-[10px] bg-surface-2 p-2 text-[12.5px]">
          {(["active", "reserve", "finished"] as Shelf[]).filter(s => s !== book.shelf).map(s => <button key={s} className="text-left hover:underline" onClick={() => { moveBook(book.id, s); setMenu(false); }}>Move to {SHELF_NAME[s]}</button>)}
          <Link href={`/read/${book.id}?sheet=notes`} className="hover:underline">Notes and highlights</Link>
          {confirm ? <button className="text-left text-danger" onClick={() => removeBook(book.id)}>Yes, remove it and its file</button>
            : <button className="text-left text-danger hover:underline" onClick={() => setConfirm(true)}>Remove from library</button>}
        </div>
      )}
    </div>
  );
}

/** Today's reading: a few pages a day from where you stopped. */
export function TodaysReading({ compact = false }: { compact?: boolean }) {
  const s = useStore();
  const lib = s.get("library");
  const [day] = useState(() => today());
  const book = todaysBook(lib, day);
  const per = Number(s.get("readerSettings")?.pagesPerDay ?? 5);
  if (!book) return compact ? null : (
    <Card className="flex flex-col gap-2">
      <p className="font-medium">Your shelf is empty</p>
      <p className="text-[13.5px] text-muted">Add a book you own, or download a free classic below. Lumen will plan a few pages for you each day.</p>
    </Card>
  );
  const plan = readingPlan(book, s.get("reading")?.[book.id], day, per);
  return (
    <>
      {compact && <SectionTitle right={`${per} pages a day`}>Today&apos;s reading</SectionTitle>}
      <Card className="flex flex-col gap-3">
        <div className="flex items-start gap-3.5">
          <Cover book={book} className="w-[52px]" />
          <div className="min-w-0">
            <p className="font-medium">{book.title}</p>
            <p className="text-[12.5px] text-muted">{book.author} · {plan.done ? "today's pages read" : plan.from === plan.to ? `page ${plan.from}` : `pages ${plan.from}–${plan.to}`}{book.at?.chapter ? ` · ${book.at.chapter}` : ""}</p>
          </div>
        </div>
        <div>
          <div className="flex justify-between text-[12.5px]"><span>{plan.done ? plan.size : plan.read} of {plan.size} page{plan.size === 1 ? "" : "s"}</span>{book.at && <span className="text-muted">{book.at.pct}% through the book</span>}</div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-2"><div className="h-full bg-[var(--lang)]" style={{ width: `${((plan.done ? plan.size : plan.read) / plan.size) * 100}%` }} /></div>
        </div>
        <div className="flex items-center justify-between gap-3">
          {plan.done ? <span className="text-[13px] font-medium text-[var(--lang)]">✓ Done for today</span> : <span className="text-[12.5px] text-muted">{!book.at ? "From the first page" : plan.read > 0 ? `Today's pages start at page ${plan.from}` : `From page ${plan.from}, where you stopped`}</span>}
          <Link href={`/read/${book.id}`} className="shrink-0 rounded-full bg-primary px-3.5 py-1.5 text-[13px] font-medium text-on-primary">{plan.done ? "Keep reading" : book.at ? `Continue at page ${book.at.page}` : "Start reading"}</Link>
        </div>
      </Card>
    </>
  );
}

export function EmptyShelf({ text, action }: { text: string; action?: React.ReactNode }) {
  return <div className="flex flex-col items-start gap-2 py-4 text-[13.5px] text-muted">{text}{action}</div>;
}

export { Button };
