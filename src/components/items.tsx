"use client";
import { useEffect, useState } from "react";
import { KIND_LABEL, type Area, type Block, type BlockType, type Item, type Progress, type Rating } from "@/lib/model";
import { store, useStore } from "@/lib/store/store";
import { Player } from "./player";
import { Button, cn } from "./ui";

export function rate(item: Item, rating: Rating) {
  return store.update("feedback", f => [...(f ?? []).filter(x => !(x.id === item.id && x.rating === rating)), { id: item.id, title: item.title, creator: item.creator, platform: item.platform, area: item.area, rating, at: Date.now() }].slice(-500));
}

export function block(type: BlockType, value: string, reason?: string) {
  return store.update("blocked", b => [{ type, value, reason, at: Date.now() } as Block, ...(b ?? []).filter(x => !(x.type === type && x.value.toLowerCase() === value.toLowerCase()))]);
}

const fmt = (s: number) => { const m = Math.floor(s / 60), h = Math.floor(m / 60); return h ? `${h}:${String(m % 60).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}` : `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`; };

export function resumeLabel(item: Item, p?: Progress): string | null {
  if (!p) return null;
  if (p.done) return "Done";
  if (item.kind === "playlist" && p.index != null) return `Video ${p.index + 1}${p.seconds ? ` · from ${fmt(p.seconds)}` : ""}`;
  if (p.seconds) return `From ${fmt(p.seconds)}`;
  if (p.fraction) return `${Math.round(p.fraction * 100)}% read`;
  return null;
}
export function pct(p?: Progress): number {
  if (!p) return 0;
  if (p.done) return 100;
  if (p.seconds && p.duration) return Math.min(100, Math.round((p.seconds / p.duration) * 100));
  return p.fraction ? Math.round(p.fraction * 100) : 0;
}

function Thumb({ item, className }: { item: Item; className?: string }) {
  const tall = item.kind === "book" || item.kind === "clip";
  return (
    <span className={cn("relative block shrink-0 overflow-hidden bg-surface-2", tall ? "aspect-[2/3] w-[64px] rounded-[6px]" : "aspect-video w-[120px] rounded-[10px]", className)}>
      {item.thumb ? <img src={item.thumb} alt="" loading="lazy" className="size-full object-cover" /> : <span className="grid size-full place-items-center font-display text-[22px] text-muted">{item.platform[0]}</span>}
    </span>
  );
}

/** One recommendation in a list. */
export function ItemCard({ item, area, onOpen }: { item: Item; area: Area; onOpen: () => void }) {
  const s = useStore();
  const prog = s.get("progress")?.[item.id];
  const [menu, setMenu] = useState(false);
  const label = resumeLabel(item, prog);
  return (
    <article className="border-t border-border py-3 first:border-t-0">
      <div className="flex items-start gap-3">
        <button onClick={onOpen} className="relative text-left" aria-label={`Open ${item.title}`}>
          <Thumb item={item} />
          {pct(prog) > 0 && <span className="absolute inset-x-0 bottom-0 h-1 bg-black/40"><span className="block h-full bg-danger" style={{ width: `${pct(prog)}%` }} /></span>}
        </button>
        <button onClick={onOpen} className="min-w-0 flex-1 text-left">
          <span className="eyebrow !text-[10.5px]">{KIND_LABEL[item.kind]}</span>
          <p className="line-clamp-2 font-medium leading-snug">{item.title}</p>
          <p className="truncate text-[12.5px] text-muted">{[item.creator, item.platform, item.minutes ? `${item.minutes} min` : ""].filter(Boolean).join(" · ")}</p>
          {label ? <p className="text-[12px] font-medium text-danger">{label}</p> : item.why && <p className="line-clamp-2 text-[12.5px] text-gold">{item.why}</p>}
        </button>
        <button aria-label={`More options for ${item.title}`} aria-expanded={menu} onClick={() => setMenu(m => !m)} className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2">⋯</button>
      </div>
      {menu && <FeedbackMenu item={item} area={area} onDone={() => setMenu(false)} />}
    </article>
  );
}

const REASONS = ["Wrong topic", "Low quality", "Already seen it", "Not my level", "Misleading or offensive"];

/** Rate or block an item; the reason teaches the recommender. */
export function FeedbackMenu({ item, area, onDone }: { item: Item; area: Area; onDone: () => void }) {
  const [reason, setReason] = useState<string | undefined>();
  const act = async (fn: () => Promise<unknown>) => { await fn(); onDone(); };
  return (
    <div className="mt-2 flex flex-col gap-2 rounded-[12px] bg-surface-2 p-3 text-[13px]">
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="ghost" onClick={() => act(() => rate(item, "up"))}>More like this</Button>
        <Button size="sm" variant="ghost" onClick={() => act(() => rate(item, "too easy"))}>Too easy</Button>
        <Button size="sm" variant="ghost" onClick={() => act(() => rate(item, "too hard"))}>Too hard</Button>
      </div>
      <span className="eyebrow mt-1">Never show me</span>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="ghost" onClick={() => act(async () => { await rate(item, "down"); await block("item", item.title, reason); })}>This item</Button>
        {item.creator && <Button size="sm" variant="ghost" onClick={() => act(() => block("creator", item.creator, reason))}>Anything from {item.creator}</Button>}
        <Button size="sm" variant="ghost" onClick={() => act(() => block("platform", item.platform, reason))}>{item.platform}</Button>
      </div>
      <span className="eyebrow mt-1">Why? (optional)</span>
      <div className="flex flex-wrap gap-1.5">{REASONS.map(r => <button key={r} onClick={() => setReason(x => (x === r ? undefined : r))} aria-pressed={reason === r} className={cn("rounded-full border px-2.5 py-1", reason === r ? "border-fg bg-fg text-bg" : "border-border bg-surface")}>{r}</button>)}</div>
      <button className="self-start text-muted underline underline-offset-4" onClick={onDone}>Cancel</button>
      <span className="sr-only">For {area.name}</span>
    </div>
  );
}

/** The item opened: plays inside Lumen when it can, otherwise opens the source. */
export function ItemSheet({ item, onClose, onDone }: { item: Item; onClose: () => void; onDone?: () => void }) {
  const s = useStore();
  const prog = s.get("progress")?.[item.id];
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", k); document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", k); document.body.style.overflow = ""; };
  }, [onClose]);
  const playable = !!(item.embed || /youtube\.com/.test(item.url));
  async function done() {
    await store.update("progress", p => ({ ...(p ?? {}), [item.id]: { ...(p?.[item.id] ?? {}), done: true, at: Date.now() } }));
    await rate(item, "done");
    onDone?.(); onClose();
  }
  return (
    <div role="dialog" aria-modal="true" aria-label={item.title} className="fixed inset-0 z-40 flex items-end justify-center bg-black/45 lg:items-center" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="flex max-h-[94dvh] w-full flex-col gap-4 overflow-y-auto rounded-t-[20px] bg-bg p-4 [padding-bottom:calc(16px+env(safe-area-inset-bottom))] lg:max-w-[880px] lg:rounded-[20px] lg:p-7">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="eyebrow">{KIND_LABEL[item.kind]} · {item.platform}</span>
            <h2 className="text-[24px] leading-tight lg:text-[30px]">{item.title}</h2>
            <p className="text-[13.5px] text-muted">{[item.creator, item.minutes ? `${item.minutes} min` : ""].filter(Boolean).join(" · ")}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="grid size-9 shrink-0 place-items-center rounded-full border border-border hover:bg-surface-2">✕</button>
        </div>
        {playable ? <Player item={item} /> : item.thumb && <img src={item.thumb} alt="" className={cn("rounded-[12px] object-cover", item.kind === "book" ? "w-32" : "aspect-video w-full")} />}
        {item.why && <p className="text-[14px]"><span className="font-medium">Why it fits: </span>{item.why}</p>}
        {item.notice && <p className="rounded-[12px] border-l-[3px] border-gold bg-gold-soft px-3 py-2 text-[14px]"><span className="font-medium">What to notice: </span>{item.notice}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <a href={item.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center rounded-full border border-border px-4 text-[14px] font-medium hover:bg-surface-2">{playable ? "Open on " + item.platform : item.kind === "book" ? "Open the book" : "Open"} ↗</a>
          <Button onClick={done}>{prog?.done ? "✓ Done" : "Mark as done"}</Button>
          <Button variant="ghost" onClick={() => rate(item, "up")}>More like this</Button>
        </div>
      </div>
    </div>
  );
}
