"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { KIND_LABEL, type Item, type ItemKind } from "@/lib/model";
import { focusFor } from "@/lib/plan";
import { findPicks, picksFor, savePickSet, today } from "@/lib/recs";
import { AI_PROBLEM, AiError } from "@/lib/gemini";
import { store, useStore } from "@/lib/store/store";
import { ItemCard, ItemSheet, pct } from "@/components/items";
import { AddLink } from "@/components/add-link";
import { Button, Card, PageTitle, Pill, SectionTitle } from "@/components/ui";

export default function Learn() {
  const s = useStore();
  const p = s.get("profile")!;
  const ai = s.get("ai");
  const areas = p.areas.filter(a => a.cat !== "news" && a.freq !== "Paused");
  const [now] = useState(() => new Date());
  const [areaId, setAreaId] = useState(() => focusFor(p.areas, p.planMode, now)?.id ?? areas[0]?.id);
  const area = areas.find(a => a.id === areaId) ?? areas[0];
  const [kind, setKind] = useState<ItemKind | "all">("all");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [open, setOpen] = useState<Item | null>(null);
  const tried = useRef(new Set<string>());

  const set = area ? picksFor(s.get("picks"), area.id) : undefined;

  const find = useCallback(async (fresh = false) => {
    if (!area || ai?.mode !== "own" || !ai.key) return;
    setBusy(true); setProblem(null);
    try {
      const docs = { profile: store.get("profile"), blocked: store.get("blocked"), feedback: store.get("feedback"), added: store.get("added"), picks: fresh ? store.get("picks") : store.get("picks")?.filter(x => x.day !== today()) };
      const items = await findPicks({ key: ai.key, area, docs });
      if (!items.length) setProblem("Lumen couldn't confirm any picks this time. Try again in a moment.");
      const prev = fresh ? (picksFor(store.get("picks"), area.id)?.items ?? []) : [];
      await store.set("picks", savePickSet(store.get("picks"), { area: area.id, day: today(), items: [...items, ...prev.filter(x => !items.some(i => i.id === x.id))].slice(0, 16), at: Date.now() }));
    } catch (e) {
      setProblem(e instanceof AiError ? AI_PROBLEM[e.reason] : (e as Error).message === "slow_down" ? "Too many checks at once. Wait a minute and try again." : "Couldn't find picks right now. Try again in a moment.");
    } finally { setBusy(false); }
  }, [area, ai]);

  // First visit today for an area: find picks once, automatically.
  useEffect(() => {
    if (!area || set || busy || ai?.mode !== "own" || tried.current.has(area.id)) return;
    tried.current.add(area.id);
    find();
  }, [area, set, busy, ai, find]);

  const blocked = s.get("blocked") ?? [];
  const items = (set?.items ?? []).filter(i => !blocked.some(b => b.type === "item" && b.value === i.title) && !blocked.some(b => b.type === "creator" && b.value === i.creator) && !blocked.some(b => b.type === "platform" && b.value === i.platform));
  const shown = items.filter(i => kind === "all" || i.kind === kind);
  const kinds = [...new Set(items.map(i => i.kind))];
  const progress = s.get("progress") ?? {};
  const resume = (s.get("picks") ?? []).flatMap(x => x.items).filter((i, n, all) => all.findIndex(j => j.id === i.id) === n && progress[i.id] && !progress[i.id].done && pct(progress[i.id]) > 0).slice(0, 8);

  return (
    <>
      <PageTitle title="Learn" sub="Picked for your goals and level. Plays inside Lumen, with no feeds." />

      <div className="flex flex-col gap-3.5 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-8">
        <div className="flex flex-col gap-3.5">
          <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Area">
            {areas.map(a => <Pill key={a.id} on={a.id === area?.id} onClick={() => { setAreaId(a.id); setKind("all"); setProblem(null); }} className="shrink-0">{a.name}</Pill>)}
          </div>

          {ai?.mode !== "own" ? (
            <Card className="flex flex-col gap-2">
              <p className="font-medium">Connect your free AI to get picks</p>
              <p className="text-[13.5px] text-muted">Lumen uses your own Gemini key to search for specific videos, clips, podcasts, books and articles that fit you.</p>
              <Link href="/you#ai" className="self-start rounded-full bg-primary px-3.5 py-1.5 text-[13px] font-medium text-on-primary">Connect</Link>
            </Card>
          ) : (
            <Card>
              <div className="mb-1 flex items-center justify-between gap-3">
                <span className="eyebrow">{area ? `Today for ${area.name}` : "Today"}</span>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => find(true)}>{busy ? "Searching…" : set ? "More picks" : "Find picks"}</Button>
              </div>
              {kinds.length > 1 && (
                <div className="no-scrollbar mb-1 flex gap-1.5 overflow-x-auto py-1">
                  <Pill on={kind === "all"} onClick={() => setKind("all")} className="shrink-0 !py-1 !text-[12.5px]">All</Pill>
                  {kinds.map(k => <Pill key={k} on={kind === k} onClick={() => setKind(k)} className="shrink-0 !py-1 !text-[12.5px]">{KIND_LABEL[k]}s</Pill>)}
                </div>
              )}
              {problem && <p role="alert" className="py-2 text-[13.5px] text-danger">{problem}</p>}
              {busy && !items.length && <p className="py-6 text-center text-[14px] text-muted">Searching and checking every link…</p>}
              {!busy && set && !items.length && !problem && <p className="py-6 text-center text-[14px] text-muted">Nothing left for today. Tap “More picks”.</p>}
              <div className="lg:grid lg:grid-cols-2 lg:gap-x-6">
                {area && shown.map(i => <ItemCard key={i.id} item={i} area={area} onOpen={() => setOpen(i)} />)}
              </div>
            </Card>
          )}
        </div>

        <aside className="flex flex-col gap-3.5 lg:sticky lg:top-24">
          {resume.length > 0 && (
            <>
              <SectionTitle>Continue where you left off</SectionTitle>
              <Card>{resume.map(i => { const a = p.areas.find(x => x.id === i.area) ?? area!; return <ItemCard key={i.id} item={i} area={a} onOpen={() => setOpen(i)} />; })}</Card>
            </>
          )}
          <SectionTitle>Add something you found</SectionTitle>
          <AddLink />
        </aside>
      </div>

      {open && <ItemSheet item={open} onClose={() => setOpen(null)} />}
    </>
  );
}
