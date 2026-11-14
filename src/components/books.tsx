"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { BookDoc, LibraryEntry, Shelf } from "@/lib/model";
import { loadBook, moveBook, removeBook, todaysBook } from "@/lib/books/library";
import { boundaries, planProgress, planText, planToday, positionOf, themePrompt, toThemeCuts, unitsOf, WPM, type DailyPlan } from "@/lib/books/daily";
import { aiProblem, generateJson } from "@/lib/gemini";
import { today } from "@/lib/recs";
import { store, useStore } from "@/lib/store/store";
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

const KIND_LABEL: Record<DailyPlan["kind"], string> = { chapter: "A whole chapter", chapters: "Short chapters, read whole", section: "A complete section", theme: "One theme", part: "Part of a long chapter" };
const MINUTES = [10, 15, 20, 30, 45];

/**
 * Today's plan for a book: worked out once a day from where you are, as a whole chapter or section
 * (by its headings, or by theme with your own AI for long chapters without them).
 */
function useDailyPlan(book: LibraryEntry | null, day: string, minutes: number) {
  const s = useStore();
  const saved = book ? s.get("dailyReading")?.plans[book.id] : undefined;
  const st = book ? s.get("reading")?.[book.id] : undefined;
  const [doc, setDoc] = useState<BookDoc | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "none">("loading");
  useEffect(() => {
    let live = true;
    if (!book) return;
    loadBook(book.id).then(d => { if (live) { setDoc(d); setState(d ? "ready" : "none"); } }).catch(() => live && setState("none"));
    return () => { live = false; };
  }, [book?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const units = useMemo(() => (doc ? unitsOf(doc) : []), [doc]);
  const pos = doc ? positionOf(doc, st) : 0;

  // Make (or remake) today's plan: once a day, or when your reading time changes.
  useEffect(() => {
    if (!book || !doc || !units.length) return;
    if (saved && saved.day === day && saved.minutes === minutes) return;
    const themes = store.get("dailyReading")?.themes[book.id] ?? {};
    let plan = planToday(doc, units, boundaries(doc, units, themes), pos, minutes, day);
    if (!plan) return;
    const write = (p: DailyPlan) => store.update("dailyReading", d => ({ plans: { ...(d?.plans ?? {}), [book.id]: { ...p, minutes } }, themes: d?.themes ?? {} }));
    void write(plan);
    // A long chapter with no headings: ask your AI to split it by theme, then plan again.
    const ai = store.get("ai");
    const ch = units[plan.start]?.ch;
    if (plan.kind === "part" && ai?.mode === "own" && ai.key && ch != null && !themes[ch]) {
      const c = doc.chapters[ch];
      generateJson<unknown>(ai.key, themePrompt(c.title, c.paras, minutes * WPM)).then(async raw => {
        const cuts = toThemeCuts(raw, c.paras.length);
        if (!cuts.length) return;
        const all = { ...themes, [ch]: cuts };
        await store.update("dailyReading", d => ({ plans: d?.plans ?? {}, themes: { ...(d?.themes ?? {}), [book.id]: all } }));
        plan = planToday(doc, units, boundaries(doc, units, all), pos, minutes, day);
        if (plan) {
          let first = 0;
          for (let k = 0; k < ch; k++) first += doc.chapters[k].paras.length;
          const cut = cuts.find(x => first + x.start === plan!.start) ?? [...cuts].reverse().find(x => first + x.start < plan!.start);
          await write({ ...plan, ...(cut?.about ? { about: cut.about } : {}) });
        }
      }).catch(() => {});
    }
  }, [book?.id, doc, day, minutes, saved?.day, saved?.minutes]); // eslint-disable-line react-hooks/exhaustive-deps

  const plan = saved && saved.day === day ? saved : null;
  const progress = plan && units.length ? planProgress(units, plan, pos) : null;
  return { plan, progress, doc, units, state };
}

/** Today's reading: one complete piece of a book, sized to your reading time, from where you stopped. */
export function TodaysReading({ compact = false }: { compact?: boolean }) {
  const s = useStore();
  const lib = s.get("library");
  const [day] = useState(() => today());
  const book = todaysBook(lib, day);
  const minutes = Number(s.get("readerSettings")?.readMinutes ?? 20);
  const { plan, progress, doc, units, state } = useDailyPlan(book, day, minutes);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ai = s.get("ai");
  if (!book) return compact ? null : (
    <Card className="flex flex-col gap-2">
      <p className="font-medium">Your shelf is empty</p>
      <p className="text-[13.5px] text-muted">Add a book you own, or download a free classic below. Lumen will plan a complete chapter or section for you each day.</p>
    </Card>
  );
  const setMinutes = (m: number) => store.set("readerSettings", { ...(store.get("readerSettings") ?? {}), readMinutes: m });
  const firstWords = (() => {
    if (!plan || !doc || plan.about) return plan?.about;
    for (let i = plan.start; i < Math.min(plan.end, plan.start + 4); i++) {
      const u = units[i];
      const t = doc.chapters[u.ch]?.paras[u.i] ?? "";
      if (!u.heading && t.length > 40) return t.replace(/\s+/g, " ").slice(0, 170).replace(/\s\S*$/, "") + "…";
    }
    return undefined;
  })();
  async function learn() {
    if (!plan || !doc || ai?.mode !== "own" || !ai.key) return;
    setBusy(true); setErr(null);
    try {
      const raw = await generateJson<unknown>(ai.key, `Here is a passage someone read today from "${book!.title}" by ${book!.author} (${plan.title}). Give the 3 to 5 key ideas they should take away, each one short, concrete sentence in plain words, in the order they come.\n\n${planText(doc, units, plan)}\n\nReply with JSON only: ["…", "…"]`);
      const takeaways = (Array.isArray(raw) ? raw : []).map(x => String(x).slice(0, 220)).filter(Boolean).slice(0, 5);
      if (takeaways.length) await store.update("dailyReading", d => ({ plans: { ...(d?.plans ?? {}), [book!.id]: { ...plan, takeaways } }, themes: d?.themes ?? {} }));
      else setErr("No key ideas came back. Try again.");
    } catch (e) { setErr(aiProblem(e, "Couldn't get the key ideas. Try again.")); }
    setBusy(false);
  }
  const done = !!progress?.done;
  const pct = Math.round((progress?.fraction ?? 0) * 100);
  return (
    <>
      {compact && <SectionTitle right={`About ${minutes} min a day`}>Today&apos;s reading</SectionTitle>}
      <Card className="flex flex-col gap-3">
        <div className="flex items-start gap-3.5">
          <Cover book={book} className="w-[52px]" />
          <div className="min-w-0 flex-1">
            {plan ? <>
              <p className="eyebrow">{KIND_LABEL[plan.kind]} · about {Math.max(1, Math.round(plan.words / WPM))} min</p>
              <p className="font-display text-[21px] leading-tight">{plan.title}</p>
              <p className="text-[12.5px] text-muted">{book.title} · {book.author}</p>
            </> : <>
              <p className="font-medium">{book.title}</p>
              <p className="text-[12.5px] text-muted">{book.author} · {state === "none" ? "open the book once on this device to plan its reading" : "planning today's reading…"}</p>
            </>}
          </div>
        </div>
        {plan && firstWords && !done && <p className="text-[13.5px] text-muted">{firstWords}</p>}
        {plan && !done && plan.next && <p className="text-[12.5px] text-muted">Stop when you reach <span className="font-medium text-fg">“{plan.next}”</span>. That&apos;s the end of today&apos;s piece.</p>}
        {plan && (
          <div>
            <div className="flex justify-between text-[12.5px]"><span>{done ? "Read today" : pct ? `${pct}% of today's piece` : "Not started"}</span>{book.at && <span className="text-muted">{book.at.pct}% through the book</span>}</div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-2"><div className="h-full bg-[var(--lang)]" style={{ width: `${done ? 100 : pct}%` }} /></div>
          </div>
        )}
        {done && plan?.takeaways && (
          <div className="flex flex-col gap-1.5 rounded-[12px] bg-surface-2 p-3">
            <span className="eyebrow">What you learned</span>
            <ul className="list-disc space-y-1 pl-4 text-[13.5px]">{plan.takeaways.map(t => <li key={t}>{t}</li>)}</ul>
          </div>
        )}
        {err && <p role="alert" className="text-[13px] text-danger">{err}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {done ? <span className="text-[13px] font-medium text-[var(--lang)]">✓ {plan?.title}: done for today</span>
            : <span className="flex items-center gap-1 text-[12px] text-muted">Reading time
                <select aria-label="Reading time a day" value={minutes} onChange={e => void setMinutes(Number(e.target.value))} className="rounded-[8px] border border-border bg-surface-2 px-1.5 py-0.5 text-[12.5px]">
                  {MINUTES.map(m => <option key={m} value={m}>{m} min</option>)}
                </select></span>}
          <span className="flex gap-2">
            {done && !plan?.takeaways && ai?.mode === "own" && <Button size="sm" variant="ghost" disabled={busy} onClick={learn}>{busy ? "Thinking…" : "What did I learn?"}</Button>}
            <Link href={`/read/${book.id}`} className="shrink-0 rounded-full bg-primary px-3.5 py-1.5 text-[13px] font-medium text-on-primary">{done ? "Keep reading" : progress?.fraction ? "Carry on" : book.at ? "Start today's piece" : "Start reading"}</Link>
          </span>
        </div>
      </Card>
    </>
  );
}

export function EmptyShelf({ text, action }: { text: string; action?: React.ReactNode }) {
  return <div className="flex flex-col items-start gap-2 py-4 text-[13.5px] text-muted">{text}{action}</div>;
}

export { Button };
