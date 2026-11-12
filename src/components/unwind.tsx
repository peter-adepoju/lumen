"use client";
import Link from "next/link";
import { useState } from "react";
import type { UnwindPick, UnwindSet } from "@/lib/model";
import { isoWeek, unwindPicks } from "@/lib/practice-ai";
import { AI_PROBLEM, AiError } from "@/lib/gemini";
import { store, useStore } from "@/lib/store/store";
import { Button, Card, Chip } from "./ui";

async function saveWeek(set: UnwindSet) {
  const next = { ...set, at: Date.now() };
  await store.update("unwind", l => [...(l ?? []).filter(x => x.week !== set.week), next].slice(-26));
}

const KIND = { series: "Series", film: "Film", documentary: "Documentary" } as const;

function PickRow({ pick, onSkip }: { pick: UnwindPick; onSkip: () => void }) {
  return (
    <li className="flex flex-col gap-1.5 border-t border-border py-3 first:border-t-0 first:pt-0">
      <div className="flex items-center gap-2 text-[12px] text-muted"><Chip>{KIND[pick.kind]}</Chip>{pick.year && <span>{pick.year}</span>}{pick.area && <span className="truncate">· {pick.area}</span>}</div>
      <a href={pick.url} target="_blank" rel="noopener noreferrer" className="font-display text-[22px] leading-tight hover:underline hover:underline-offset-4">{pick.title}</a>
      {pick.why && <p className="text-[13.5px]">{pick.why}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {pick.where ? <p className="text-[12.5px] text-muted">Watch on {pick.where}</p> : <span />}
        <button onClick={onSkip} className="text-[12.5px] text-muted underline underline-offset-4 hover:text-fg">Not my thing</button>
      </div>
    </li>
  );
}

/** A few films or series for the weekend: fun first, with something useful inside. Made once a week. */
export function UnwindList({ compact }: { compact?: boolean }) {
  const s = useStore();
  const ai = s.get("ai");
  const [now] = useState(() => new Date());
  const week = isoWeek(now);
  const sets = s.get("unwind") ?? [];
  const set = sets.find(x => x.week === week);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function make() {
    if (ai?.mode !== "own" || !ai.key) return;
    setBusy(true); setErr(null);
    try {
      const avoid = [...sets.flatMap(x => x.items.map(i => i.title)), ...(store.get("blocked") ?? []).filter(b => b.type === "item").map(b => b.value)];
      const items = await unwindPicks(ai.key, store.get("profile")!, avoid);
      await saveWeek({ week, items, at: 0 });
    } catch (e) { setErr(e instanceof AiError ? AI_PROBLEM[e.reason] : "Couldn't find picks. Try again."); }
    finally { setBusy(false); }
  }
  async function skip(p: UnwindPick) {
    await store.update("unwind", l => (l ?? []).map(x => (x.week === week ? { ...x, items: x.items.filter(i => i.id !== p.id) } : x)));
    await store.update("blocked", b => [{ type: "item" as const, value: p.title, reason: "Not my thing (Unwind)", at: Date.now() }, ...(b ?? [])]);
  }

  const items = set?.items ?? [];
  const shown = compact ? items.slice(0, 2) : items;
  return (
    <Card className="flex flex-col gap-3">
      {shown.length > 0 && <ul className="flex flex-col">{shown.map(p => <PickRow key={p.id} pick={p} onSkip={() => skip(p)} />)}</ul>}
      {set && !items.length && <p className="text-[13.5px] text-muted">You skipped them all. Ask for fresh ones.</p>}
      {ai?.mode !== "own" ? <p className="text-[13.5px] text-muted">Connect your Gemini key under You for weekend picks.</p> : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {compact && items.length > 2 ? <Link href="/unwind" className="text-[13px] underline underline-offset-4">See all {items.length}</Link> : <span className="text-[12.5px] text-muted">{set ? "New picks every week" : "Fun first, with something quietly useful inside."}</span>}
          {(!set || !compact) && <Button size="sm" variant="ghost" disabled={busy} onClick={make}>{busy ? "Finding picks…" : set ? "Fresh picks" : "Find weekend picks"}</Button>}
        </div>
      )}
      {err && <p role="alert" className="text-[13px] text-danger">{err}</p>}
    </Card>
  );
}
