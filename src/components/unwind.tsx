"use client";
import Link from "next/link";
import { useState } from "react";
import type { UnwindPick, UnwindSet } from "@/lib/model";
import { isoWeek, languageFilmPicks, unwindPicks } from "@/lib/practice-ai";
import { aiProblem } from "@/lib/gemini";
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
      <div className="flex items-center gap-2 text-[12px] text-muted"><Chip>{KIND[pick.kind]}</Chip>{pick.level && <Chip>{pick.level[0].toUpperCase() + pick.level.slice(1)}</Chip>}{pick.year && <span>{pick.year}</span>}{pick.area && !pick.lang && <span className="truncate">· {pick.area}</span>}</div>
      <a href={pick.url} target="_blank" rel="noopener noreferrer" className="font-display text-[22px] leading-tight hover:underline hover:underline-offset-4">{pick.title}</a>
      {pick.why && <p className="text-[13.5px]">{pick.why}</p>}
      {pick.tip && <p className="text-[13px] text-muted"><span className="font-medium text-fg">How to watch it to learn: </span>{pick.tip}</p>}
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
    } catch (e) { setErr(aiProblem(e, "Couldn't find picks. Try again.")); }
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

const LEVELS = ["beginner", "intermediate", "advanced"] as const;

/** Films and series in the languages you're learning: made in that language, at your level, with a tip on how to learn from each. */
export function LanguageFilms({ compact }: { compact?: boolean }) {
  const s = useStore();
  const ai = s.get("ai");
  const profile = s.get("profile");
  const langs = (profile?.areas ?? []).filter(a => a.cat === "lang" && a.freq !== "Paused");
  const [now] = useState(() => new Date());
  const week = isoWeek(now);
  const sets = s.get("unwind") ?? [];
  const set = sets.find(x => x.week === week);
  const picks = set?.language ?? [];
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!langs.length) return null;
  const level = (id: string) => profile?.langLevels?.[id] ?? "beginner";

  async function find() {
    if (ai?.mode !== "own" || !ai.key || !profile) return;
    setBusy(true); setErr(null);
    try {
      const avoid = [...sets.flatMap(x => [...x.items, ...(x.language ?? [])].map(i => i.title)), ...(store.get("blocked") ?? []).filter(b => b.type === "item").map(b => b.value)];
      const language = await languageFilmPicks(ai.key, langs.map(l => ({ name: l.name, level: level(l.id) })), avoid);
      if (!language.length) throw new Error("none");
      await store.update("unwind", l => {
        const cur = (l ?? []).find(x => x.week === week) ?? { week, items: [], at: 0 };
        return [...(l ?? []).filter(x => x.week !== week), { ...cur, language, at: Date.now() }].slice(-26);
      });
    } catch (e) { setErr((e as Error).message === "none" ? "No films came back this time. Try again." : aiProblem(e, "Couldn't find films. Try again.")); }
    finally { setBusy(false); }
  }
  async function skip(p: UnwindPick) {
    await store.update("unwind", l => (l ?? []).map(x => (x.week === week ? { ...x, language: (x.language ?? []).filter(i => i.id !== p.id) } : x)));
    await store.update("blocked", b => [{ type: "item" as const, value: p.title, reason: "Not my thing (language films)", at: Date.now() }, ...(b ?? [])]);
  }
  const shown = compact ? picks.slice(0, 2) : picks;

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <p className="text-[13.5px] text-muted">Watching shows made in a language is one of the best ways to tune your ear. Set your level so the picks are ones you can follow.</p>
        {!compact && langs.map(l => (
          <div key={l.id} className="flex flex-wrap items-center gap-2">
            <span className="min-w-[90px] font-medium">{l.name}</span>
            {LEVELS.map(v => (
              <button key={v} onClick={() => profile && void store.set("profile", { ...profile, langLevels: { ...(profile.langLevels ?? {}), [l.id]: v } })}
                aria-pressed={level(l.id) === v}
                className={level(l.id) === v ? "rounded-full border border-fg px-2.5 py-0.5 text-[12.5px]" : "rounded-full border border-border px-2.5 py-0.5 text-[12.5px] text-muted hover:text-fg"}>
                {v[0].toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        ))}
      </div>
      {langs.map(l => {
        const mine = shown.filter(p => p.lang === l.name);
        if (!mine.length) return null;
        return (
          <div key={l.id} className="flex flex-col gap-1 border-t border-border pt-3">
            <p className="eyebrow">In {l.name}</p>
            <ul className="flex flex-col">{mine.map(p => <PickRow key={p.id} pick={p} onSkip={() => skip(p)} />)}</ul>
          </div>
        );
      })}
      {ai?.mode !== "own" ? <p className="text-[13.5px] text-muted">Connect your Gemini key under You for film picks in {langs.map(l => l.name).join(" and ")}.</p> : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {compact && picks.length > 2 ? <Link href="/unwind" className="text-[13px] underline underline-offset-4">See all {picks.length}</Link> : <span className="text-[12.5px] text-muted">{picks.length ? "New films every week" : `For ${langs.map(l => l.name).join(", ")}`}</span>}
          {(!picks.length || !compact) && <Button size="sm" variant="ghost" disabled={busy} onClick={find}>{busy ? "Finding films…" : picks.length ? "Fresh films" : "Find films to learn from"}</Button>}
        </div>
      )}
      {err && <p role="alert" className="text-[13px] text-danger">{err}</p>}
    </Card>
  );
}
