"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CATEGORY_NAME, type Area, type Item, type Profile } from "@/lib/model";
import { dailyExtras, focusFor } from "@/lib/plan";
import { findPicks, picksFor, savePickSet, today } from "@/lib/recs";
import { exercise, review, warmUp, type Exercise, type Question, type Review } from "@/lib/session-ai";
import { completeSession, level, LUMENS } from "@/lib/stats";
import { AI_PROBLEM, AiError } from "@/lib/gemini";
import { store, useStore } from "@/lib/store/store";
import { ItemSheet } from "@/components/items";
import { Button, Card, Chip, cn } from "@/components/ui";

type Step = "Warm-up" | "Learn" | "Practise" | "Reflect";
const ALL: Step[] = ["Warm-up", "Learn", "Practise", "Reflect"];
/** Saves a finished session and updates the streak and lumens. */
async function recordSession(area: string, d: Step[], minutes: number) {
  const lumens = d.reduce((n, x) => n + LUMENS[x], 0);
  const st = completeSession(store.get("stats"), { day: today(), area, steps: d, minutes, lumens, at: Date.now() });
  await store.set("stats", st);
  return { lumens, streak: st.streak };
}

interface StepProps { k: string; focus: Area; p: Profile; onNext: (mark?: boolean) => void }
const problemText = (e: unknown) => (e instanceof AiError ? AI_PROBLEM[e.reason] : "Something went wrong. Try again.");

export default function Session() {
  const s = useStore();
  const router = useRouter();
  const p = s.get("profile")!;
  const ai = s.get("ai");
  const [now] = useState(() => new Date());
  const [choice] = useState(() => { try { return localStorage.getItem("lumen:choice:" + new Date().toDateString()); } catch { return null; } });
  const focus = p.planMode === "I choose each day" ? p.areas.find(a => a.id === choice) ?? null : focusFor(p.areas, p.planMode, now);
  const steps = ALL.filter(x => p.steps[x]);
  const [i, setI] = useState(0);
  const [done, setDone] = useState<Step[]>([]);
  const [finished, setFinished] = useState<{ lumens: number; streak: number } | null>(null);

  if (!focus) return (
    <Card className="flex flex-col gap-2"><p className="font-medium">No focus for today</p><p className="text-[14px] text-muted">Sunday is for your weekly review, or you haven&apos;t chosen today&apos;s area yet.</p><Link href="/today" className="self-start text-[13.5px] underline underline-offset-4">Back to Today</Link></Card>
  );
  if (ai?.mode !== "own" || !ai.key) return (
    <Card className="flex flex-col gap-2"><p className="font-medium">Connect your free AI first</p><p className="text-[14px] text-muted">Your daily session uses your own Gemini key to pick content, write exercises and give feedback.</p><Link href="/you#ai" className="self-start rounded-full bg-primary px-3.5 py-1.5 text-[13px] font-medium text-on-primary">Connect</Link></Card>
  );
  const key = ai.key;
  const step = steps[i];
  const next = (mark = true) => {
    const d = mark && step ? [...done, step] : done;
    setDone(d);
    if (i + 1 < steps.length) { setI(i + 1); window.scrollTo(0, 0); } else finish(d);
  };
  async function finish(d: Step[]) {
    setFinished(await recordSession(focus?.id ?? "", d, p.minutes));
  }

  if (finished) {
    const lv = level(store.get("stats")?.lumens ?? 0);
    return (
      <div className="flex flex-col items-center gap-4 pt-8 text-center lg:mx-auto lg:max-w-[560px]">
        <div className="orb size-24" aria-hidden />
        <span className="eyebrow">Session complete</span>
        <h1 className="text-[36px] lg:text-[48px]"><span className="tabular">{finished.streak}</span> {finished.streak === 1 ? "day" : "days"} of light</h1>
        <Card className="w-full text-left">
          <div className="flex justify-between"><span>Lumens earned</span><span className="font-mono">+{finished.lumens}</span></div>
          <div className="mt-1 flex justify-between text-muted"><span>Level</span><span>{lv.name}{lv.next ? ` · ${lv.toNext} to ${lv.next}` : ""}</span></div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-2"><div className="h-full bg-gold" style={{ width: `${lv.pct}%` }} /></div>
        </Card>
        <Button onClick={() => router.push("/today")}>Back to Today</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 lg:mx-auto lg:w-full lg:max-w-[760px]">
      <div className="flex items-center gap-3">
        <Link href="/today" aria-label="Leave session" className="grid size-9 shrink-0 place-items-center rounded-full border border-border hover:bg-surface-2">✕</Link>
        <div className="flex flex-1 gap-1.5" aria-label={`Step ${i + 1} of ${steps.length}`}>
          {steps.map((x, n) => <span key={x} className={cn("h-1 flex-1 rounded-full", n <= i ? "bg-gold" : "bg-surface-2")} />)}
        </div>
      </div>
      <div>
        <span className="eyebrow">Step {i + 1} of {steps.length} · {focus.name}</span>
        <h1 className="text-[32px] lg:text-[44px]">{step}</h1>
      </div>
      {step === "Warm-up" && <WarmUp key="w" k={key} focus={focus} p={p} onNext={next} />}
      {step === "Learn" && <LearnStep key="l" k={key} focus={focus} p={p} onNext={next} />}
      {step === "Practise" && <Practise key="p" k={key} focus={focus} p={p} onNext={next} />}
      {step === "Reflect" && <Reflect key="r" k={key} focus={focus} p={p} onNext={next} />}
    </div>
  );
}

function WarmUp({ k, focus, p, onNext }: StepProps) {
  const [qs, setQs] = useState<Question[] | null>(null);
  const [n, setN] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [right, setRight] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return; started.current = true;
    warmUp(k, focus, dailyExtras(p.areas, focus), p).then(setQs).catch(e => setErr(problemText(e)));
  }, [k, focus, p]);
  if (err) return <Problem text={err} onSkip={() => onNext(false)} />;
  if (!qs) return <Loading text="Writing your warm-up…" />;
  if (!qs.length || n >= qs.length) return (
    <Card className="flex flex-col gap-3"><p className="font-medium">{qs.length ? `${right} of ${qs.length} right` : "Warm-up ready"}</p><Button className="self-start" onClick={() => onNext()}>Continue</Button></Card>
  );
  const q = qs[n];
  return (
    <Card className="flex flex-col gap-3">
      <span className="text-[12.5px] text-muted">Question {n + 1} of {qs.length}</span>
      <p className="text-[17px] font-medium">{q.q}</p>
      <div className="flex flex-col gap-2">
        {q.options.map((o, j) => (
          <button key={j} disabled={picked != null} onClick={() => { setPicked(j); if (j === q.answer) setRight(r => r + 1); }}
            className={cn("rounded-[12px] border px-3.5 py-2.5 text-left transition", picked == null ? "border-border bg-surface hover:border-gold" : j === q.answer ? "border-success bg-[var(--lang-soft)]" : j === picked ? "border-danger" : "border-border opacity-60")}>{o}</button>
        ))}
      </div>
      {picked != null && <><p className="text-[13.5px] text-muted">{q.explain}</p><Button className="self-start" onClick={() => { setN(n + 1); setPicked(null); }}>{n + 1 < qs.length ? "Next question" : "See score"}</Button></>}
    </Card>
  );
}

function LearnStep({ k, focus, onNext }: StepProps) {
  const st = useStore();
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<Item | null>(null);
  const started = useRef(false);
  const set = picksFor(st.get("picks"), focus.id);
  const progress = st.get("progress") ?? {};
  // Once opened, the pick stays put, even after it's marked done.
  const [pickId, setPickId] = useState<string | null>(null);
  const pick = set?.items.find(x => x.id === pickId) ?? set?.items.find(x => !progress[x.id]?.done) ?? set?.items[0];
  const openPick = (it: Item) => { setPickId(it.id); setOpen(it); };
  useEffect(() => {
    if (set || started.current) return; started.current = true;
    findPicks({ key: k, area: focus, docs: { profile: store.get("profile"), blocked: store.get("blocked"), feedback: store.get("feedback"), added: store.get("added"), picks: store.get("picks") }, count: 5 })
      .then(items => store.set("picks", savePickSet(store.get("picks"), { area: focus.id, day: today(), items, at: Date.now() })))
      .catch(e => setErr(problemText(e)));
  }, [k, set, focus]);
  if (err) return <Problem text={err} onSkip={() => onNext(false)} />;
  if (!pick) return <Loading text={set ? "No picks found today." : "Finding today's pick and checking the link…"} />;
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between"><Chip cat={focus.cat}>{CATEGORY_NAME[focus.cat]}</Chip><span className="text-[12.5px] text-muted">{pick.platform}{pick.minutes ? ` · ${pick.minutes} min` : ""}</span></div>
      <button onClick={() => openPick(pick)} className="flex flex-col gap-3 text-left">
        {pick.thumb && <img src={pick.thumb} alt="" className={cn("rounded-[12px] object-cover", pick.kind === "book" ? "w-28" : "aspect-video w-full")} />}
        <span className="font-display text-[24px] leading-tight">{pick.title}</span>
      </button>
      <p className="text-[13.5px] text-muted">{pick.creator}</p>
      {pick.why && <p className="text-[14px]"><span className="font-medium">Why it fits: </span>{pick.why}</p>}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => openPick(pick)}>Open</Button>
        <Button variant="ghost" disabled={!progress[pick.id]?.done} onClick={() => onNext()}>{progress[pick.id]?.done ? "Continue" : "Mark it done to continue"}</Button>
        <Button variant="quiet" onClick={() => onNext(false)}>Skip</Button>
      </div>
      {open && <ItemSheet item={open} onClose={() => setOpen(null)} />}
    </Card>
  );
}

function Practise({ k, focus, p, onNext }: StepProps) {
  const [ex, setEx] = useState<Exercise | null>(null);
  const [answer, setAnswer] = useState("");
  const [rev, setRev] = useState<Review | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return; started.current = true;
    exercise(k, focus, p, Math.max(5, Math.round(p.minutes / 3))).then(setEx).catch(e => setErr(problemText(e)));
  }, [k, focus, p]);
  if (err && !ex) return <Problem text={err} onSkip={() => onNext(false)} />;
  if (!ex) return <Loading text="Writing your exercise…" />;
  return (
    <Card className="flex flex-col gap-3">
      <span className="eyebrow">{ex.title} · about {ex.minutes} min</span>
      <p className="text-[16px]">{ex.task}</p>
      {ex.tips.length > 0 && <ul className="flex flex-col gap-1 text-[13.5px] text-muted">{ex.tips.map(t => <li key={t}>· {t}</li>)}</ul>}
      <label htmlFor="answer" className="sr-only">Your answer</label>
      <textarea id="answer" rows={7} value={answer} onChange={e => setAnswer(e.target.value)} disabled={!!rev} placeholder="Write your answer here…" className="rounded-[12px] border border-border bg-surface p-3 text-[15px]" />
      {err && <p className="text-[13.5px] text-danger">{err}</p>}
      {!rev ? (
        <div className="flex flex-wrap gap-2">
          <Button disabled={answer.trim().length < 20 || busy} onClick={async () => { setBusy(true); setErr(null); try { setRev(await review(k, focus, ex, answer)); } catch (e) { setErr(problemText(e)); } setBusy(false); }}>{busy ? "Reviewing…" : "Get feedback"}</Button>
          <Button variant="quiet" onClick={() => onNext(false)}>Skip</Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 border-t border-border pt-3">
          {rev.scores.map(sc => (
            <div key={sc.name} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-[14px]"><span>{sc.name}</span><span className="font-mono">{sc.score}/5</span><span className="col-span-2 h-1 overflow-hidden rounded-full bg-surface-2"><span className="block h-full bg-[var(--skill)]" style={{ width: `${sc.score * 20}%` }} /></span></div>
          ))}
          {rev.strengths.length > 0 && <p className="text-[14px]"><span className="font-medium">Strong: </span>{rev.strengths.join(" ")}</p>}
          {rev.fixes.length > 0 && <div className="text-[14px]"><span className="font-medium">Try next time:</span><ul className="mt-1 flex flex-col gap-1">{rev.fixes.map(f => <li key={f}>· {f}</li>)}</ul></div>}
          {rev.better && <p className="rounded-[12px] border-l-[3px] border-gold bg-gold-soft px-3 py-2 text-[14px]">{rev.better}</p>}
          <Button className="self-start" onClick={() => onNext()}>Continue</Button>
        </div>
      )}
    </Card>
  );
}

function Reflect({ focus, onNext }: StepProps) {
  const [text, setText] = useState("");
  return (
    <Card className="flex flex-col gap-3">
      <label htmlFor="reflection" className="font-medium">What did you learn, and how will you use it today?</label>
      <textarea id="reflection" rows={4} value={text} onChange={e => setText(e.target.value)} placeholder="One line is enough." className="rounded-[12px] border border-border bg-surface p-3" />
      <p className="text-[12.5px] text-muted">Private to you, saved in your own Drive. Never sent to the AI.</p>
      <div className="flex gap-2">
        <Button disabled={!text.trim()} onClick={async () => { await store.update("journal", j => [...(j ?? []), { day: today(), area: focus.id, text: text.trim(), at: Date.now() }].slice(-2000)); onNext(); }}>Finish session</Button>
        <Button variant="quiet" onClick={() => onNext(false)}>Skip</Button>
      </div>
    </Card>
  );
}

function Loading({ text }: { text: string }) {
  return <Card className="flex items-center gap-3 py-8"><span className="orb size-6" aria-hidden /><p className="text-[14px] text-muted" role="status">{text}</p></Card>;
}
function Problem({ text, onSkip }: { text: string; onSkip: () => void }) {
  return <Card className="flex flex-col gap-2"><p role="alert" className="text-[14px] text-danger">{text}</p><button className="self-start text-[13.5px] underline underline-offset-4" onClick={onSkip}>Skip this step</button></Card>;
}
