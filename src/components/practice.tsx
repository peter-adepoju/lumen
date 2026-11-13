"use client";
import { useEffect, useRef, useState } from "react";
import type { Area, Card as CardT, DrillKind, Grade } from "@/lib/model";
import { digits, dueCards, newCard, oddGrid, previewIntervals, review } from "@/lib/practice";
import { makeCards, quiz } from "@/lib/practice-ai";
import type { Question } from "@/lib/session-ai";
import { aiProblem } from "@/lib/gemini";
import { addLumens } from "@/lib/stats";
import { today } from "@/lib/recs";
import { itemId } from "@/lib/links";
import { store, useStore } from "@/lib/store/store";
import { Button, Card, cn, Pill } from "./ui";

const problem = (e: unknown) => aiProblem(e);

async function score(kind: DrillKind, value: number, out?: number, area?: string) {
  await store.update("drills", d => [...(d ?? []), { kind, score: value, out, area, day: today(), at: Date.now() }].slice(-1000));
}
async function earn(n: number) { await store.update("stats", s => addLumens(s, n)); }
const clock = () => performance.now();

/* ---------------- Flashcards ---------------- */
export function Flashcards({ areas }: { areas: Area[] }) {
  const s = useStore();
  const day = today();
  const cards = s.get("cards") ?? [];
  const due = dueCards(cards, day);
  const [reviewing, setReviewing] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(0);
  const [area, setArea] = useState(areas[0]?.id ?? "");
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const ai = s.get("ai");
  const cur = reviewing ? due[0] : undefined;

  async function grade(g: Grade) {
    if (!cur) return;
    await store.update("cards", list => (list ?? []).map(c => (c.id === cur.id ? review(c, g, day) : c)));
    setFlipped(false); setDone(n => n + 1);
    if (due.length <= 1) { setReviewing(false); await earn(5 + done * 2); }
  }
  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!front.trim() || !back.trim()) return;
    await store.update("cards", l => [...(l ?? []), newCard({ id: itemId(front + Date.now()), area, front, back, source: "You" }, day)]);
    setFront(""); setBack(""); setMsg("Card added. It's due today.");
  }
  async function generate() {
    const a = areas.find(x => x.id === area);
    if (!a || ai?.mode !== "own" || !ai.key) return;
    setBusy(true); setMsg(null);
    try {
      const made = await makeCards(ai.key, a, store.get("profile")!, 10, cards.filter(c => c.area === a.id).map(c => c.front));
      await store.update("cards", l => [...(l ?? []), ...made.map(m => newCard({ id: itemId(m.front + a.id), area: a.id, front: m.front, back: m.back, source: "AI" }, day))].filter((c, i, all) => all.findIndex(x => x.id === c.id) === i));
      setMsg(`Added ${made.length} cards for ${a.name}.`);
    } catch (e) { setMsg(problem(e)); } finally { setBusy(false); }
  }

  if (cur) {
    const prev = previewIntervals(cur, day);
    return (
      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between text-[12.5px] text-muted"><span>{cur.area === "books" ? `From ${cur.source ?? "your books"}` : areas.find(a => a.id === cur.area)?.name ?? "Card"} · {due.length} left</span><button className="underline underline-offset-4" onClick={() => setReviewing(false)}>Stop</button></div>
        <button onClick={() => setFlipped(f => !f)} className="grid min-h-[180px] place-items-center rounded-[14px] border border-border bg-surface p-5 text-center" aria-label={flipped ? "Show the front" : "Show the answer"}>
          <span className="flex flex-col gap-2">
            <span className="font-display text-[26px] leading-tight">{cur.front}</span>
            {flipped && <span className="whitespace-pre-line border-t border-border pt-2 text-[15px]">{cur.back}</span>}
          </span>
        </button>
        {!flipped ? <Button onClick={() => setFlipped(true)}>Show answer</Button> : (
          <div className="grid grid-cols-4 gap-2">
            {(["again", "hard", "good", "easy"] as Grade[]).map(g => (
              <button key={g} onClick={() => grade(g)} className="flex flex-col items-center rounded-[12px] border border-border bg-surface py-2 text-[13px] font-medium capitalize hover:border-gold">{g}<span className="font-mono text-[11px] font-normal text-muted">{prev[g]}</span></button>
            ))}
          </div>
        )}
      </Card>
    );
  }
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div><p className="font-medium">{due.length ? `${due.length} card${due.length === 1 ? "" : "s"} due today` : done ? "All caught up for today" : "No cards due"}</p><p className="text-[12.5px] text-muted">{cards.length} cards · spaced repetition brings each back just before you&rsquo;d forget it</p></div>
        <Button size="sm" disabled={!due.length} onClick={() => { setReviewing(true); setDone(0); }}>Review</Button>
      </div>
      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="card-area" className="sr-only">Area</label>
          <select id="card-area" value={area} onChange={e => setArea(e.target.value)} className="rounded-[8px] border border-border bg-surface-2 px-2 py-1.5 text-[13px]">{areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          {ai?.mode === "own" && <Button size="sm" variant="ghost" disabled={busy} onClick={generate}>{busy ? "Making cards…" : "Make 10 cards with AI"}</Button>}
        </div>
        <form onSubmit={add} className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor="card-front" className="sr-only">Front</label>
          <input id="card-front" value={front} onChange={e => setFront(e.target.value)} placeholder="Front, e.g. la lumière" className="min-w-0 flex-1 rounded-[10px] border border-border bg-surface px-3 py-2 text-[14px]" />
          <label htmlFor="card-back" className="sr-only">Back</label>
          <input id="card-back" value={back} onChange={e => setBack(e.target.value)} placeholder="Back, e.g. the light" className="min-w-0 flex-1 rounded-[10px] border border-border bg-surface px-3 py-2 text-[14px]" />
          <Button size="sm" variant="ghost" type="submit" disabled={!front.trim() || !back.trim()}>Add card</Button>
        </form>
        {msg && <p role="status" className="text-[13px] text-muted">{msg}</p>}
      </div>
    </Card>
  );
}

/* ---------------- Digit span ---------------- */
export function DigitSpan() {
  const [phase, setPhase] = useState<"idle" | "show" | "input" | "result">("idle");
  const [len, setLen] = useState(4);
  const [seq, setSeq] = useState("");
  const [shown, setShown] = useState("");
  const [answer, setAnswer] = useState("");
  const [best, setBest] = useState(0);
  const [msg, setMsg] = useState("");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  function play(n: number) {
    const s = digits(n);
    setSeq(s); setLen(n); setAnswer(""); setPhase("show"); setShown("");
    timers.current.forEach(clearTimeout); timers.current = [];
    s.split("").forEach((d, i) => {
      timers.current.push(setTimeout(() => setShown(d), 300 + i * 1000));
      timers.current.push(setTimeout(() => setShown(""), 1050 + i * 1000));
    });
    timers.current.push(setTimeout(() => { setPhase("input"); setTimeout(() => input.current?.focus(), 30); }, 300 + s.length * 1000));
  }
  async function check(e: React.FormEvent) {
    e.preventDefault();
    if (answer.trim() === seq) {
      setBest(b => Math.max(b, len)); setMsg(`Correct. Next round: ${len + 1} digits.`); setPhase("result");
      timers.current.push(setTimeout(() => play(len + 1), 1100));
    } else {
      const top = Math.max(best, len - 1);
      setMsg(`It was ${seq.split("").join(" ")}. Your span today: ${top} digits.`); setPhase("result");
      if (top >= 3) { await score("digit-span", top); await earn(top * 3); }
      setLen(4);
    }
  }
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between"><p className="font-medium">Digit span</p><span className="text-[12px] text-muted">Memory · working memory</span></div>
      {phase === "idle" && <><p className="text-[13.5px] text-muted">Digits appear one at a time. Type them back in order. Each correct round adds one.</p><Button className="self-start" onClick={() => play(4)}>Start at 4 digits</Button></>}
      {phase === "show" && <div className="grid h-28 place-items-center font-mono text-[56px]" aria-live="polite">{shown}</div>}
      {phase === "input" && (
        <form onSubmit={check} className="flex flex-col gap-2">
          <label htmlFor="span" className="text-[13.5px] text-muted">Type the {len} digits</label>
          <input id="span" ref={input} value={answer} onChange={e => setAnswer(e.target.value.replace(/\D/g, ""))} inputMode="numeric" autoComplete="off" maxLength={len} className="rounded-[10px] border border-border bg-surface px-3 py-2 text-center font-mono text-[24px] tracking-[.25em]" />
          <Button type="submit" className="self-start" disabled={answer.length !== len}>Check</Button>
        </form>
      )}
      {phase === "result" && <><p className="text-[14px]" role="status">{msg}</p>{msg.startsWith("It was") && <Button className="self-start" variant="ghost" onClick={() => play(4)}>Try again</Button>}</>}
    </Card>
  );
}

/* ---------------- Odd one out ---------------- */
export function OddOneOut() {
  const [level, setLevel] = useState(0);
  const [grid, setGrid] = useState<ReturnType<typeof oddGrid> | null>(null);
  const [start, setStart] = useState(0);
  const [found, setFound] = useState(0);
  const [times, setTimes] = useState<number[]>([]);
  const [miss, setMiss] = useState<number | null>(null);
  const ROUNDS = 8;
  function next(l: number) { setGrid(oddGrid(l)); setStart(clock()); setMiss(null); }
  async function pick(i: number) {
    if (!grid) return;
    if (i !== grid.at) { setMiss(i); return; }
    const t = (clock() - start) / 1000, all = [...times, t];
    setTimes(all); setFound(f => f + 1);
    if (found + 1 >= ROUNDS) {
      setGrid(null);
      const avg = all.reduce((a, b) => a + b, 0) / all.length;
      await score("odd-one-out", Math.round(avg * 100) / 100); await earn(20);
    } else { setLevel(level + 1); next(level + 1); }
  }
  const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0;
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between"><p className="font-medium">Odd one out</p><span className="text-[12px] text-muted">Attention to detail · speed</span></div>
      {!grid && found === 0 && <><p className="text-[13.5px] text-muted">Find the one character that&rsquo;s different, as fast as you can. {ROUNDS} rounds, each a little bigger.</p><Button className="self-start" onClick={() => { setFound(0); setTimes([]); setLevel(0); next(0); }}>Start</Button></>}
      {grid && (
        <>
          <p className="text-[12.5px] text-muted">Round {found + 1} of {ROUNDS}</p>
          <div className="mx-auto grid w-full max-w-[360px] gap-1" style={{ gridTemplateColumns: `repeat(${grid.size}, minmax(0, 1fr))` }}>
            {Array.from({ length: grid.size * grid.size }, (_, i) => (
              <button key={i} onClick={() => pick(i)} aria-label={`Cell ${i + 1}`} className={cn("aspect-square rounded-[6px] border font-mono text-[clamp(14px,4vw,20px)]", miss === i ? "border-danger" : "border-border bg-surface hover:border-gold")}>{i === grid.at ? grid.odd : grid.base}</button>
            ))}
          </div>
        </>
      )}
      {!grid && found > 0 && <><p className="text-[14px]" role="status">Done. Average {avg.toFixed(2)} seconds a find.</p><Button className="self-start" variant="ghost" onClick={() => { setFound(0); setTimes([]); setLevel(0); next(0); }}>Play again</Button></>}
    </Card>
  );
}

/* ---------------- Quiz ---------------- */
export function Quiz({ topics }: { topics: string[] }) {
  const s = useStore();
  const ai = s.get("ai");
  const [topic, setTopic] = useState(topics[0] ?? "General knowledge");
  const [qs, setQs] = useState<Question[] | null>(null);
  const [n, setN] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [right, setRight] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function start() {
    if (ai?.mode !== "own" || !ai.key) return;
    setBusy(true); setErr(null); setQs(null); setN(0); setRight(0); setPicked(null);
    try { setQs(await quiz(ai.key, topic, store.get("profile")!)); } catch (e) { setErr(problem(e)); } finally { setBusy(false); }
  }
  async function next() {
    if (!qs) return;
    if (n + 1 >= qs.length) { await score("quiz", right, qs.length, topic); await earn(right * 5); }
    setN(n + 1); setPicked(null);
  }
  const q = qs?.[n];
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between"><p className="font-medium">Quiz</p><span className="text-[12px] text-muted">Any area or interest</span></div>
      {ai?.mode !== "own" ? <p className="text-[13.5px] text-muted">Connect your free Gemini key under You to play quizzes.</p> : !qs || n >= qs.length ? (
        <>
          {qs && <p className="text-[14px]" role="status">You got {right} of {qs.length}. +{right * 5} lumens.</p>}
          <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">{topics.map(t => <Pill key={t} on={t === topic} onClick={() => setTopic(t)} className="shrink-0 !py-1 !text-[12.5px]">{t}</Pill>)}</div>
          {err && <p role="alert" className="text-[13px] text-danger">{err}</p>}
          <Button className="self-start" disabled={busy} onClick={start}>{busy ? "Writing questions…" : qs ? "Play again" : `Start a ${topic} quiz`}</Button>
        </>
      ) : q && (
        <>
          <p className="text-[12.5px] text-muted">Question {n + 1} of {qs.length} · {topic}</p>
          <p className="text-[17px] font-medium">{q.q}</p>
          <div className="flex flex-col gap-2">{q.options.map((o, j) => (
            <button key={j} disabled={picked != null} onClick={() => { setPicked(j); if (j === q.answer) setRight(r => r + 1); }}
              className={cn("rounded-[12px] border px-3.5 py-2.5 text-left", picked == null ? "border-border bg-surface hover:border-gold" : j === q.answer ? "border-success bg-[var(--lang-soft)]" : j === picked ? "border-danger" : "border-border opacity-60")}>{o}</button>
          ))}</div>
          {picked != null && <><p className="text-[13.5px] text-muted">{q.explain}</p><Button className="self-start" onClick={next}>{n + 1 < qs.length ? "Next question" : "See score"}</Button></>}
        </>
      )}
    </Card>
  );
}

export type { CardT };
