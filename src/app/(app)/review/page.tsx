"use client";
import Link from "next/link";
import { useState } from "react";
import { REVIEW_PROMPTS, reviewEntry, weekSummary } from "@/lib/review";
import { completeSession } from "@/lib/stats";
import { today } from "@/lib/recs";
import { addDays } from "@/lib/practice";
import { store, useStore } from "@/lib/store/store";
import { Button, Card, cn, PageTitle, SectionTitle } from "@/components/ui";

const REVIEW_LUMENS = 40;
const fmt = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });

async function finishReview(day: string, answers: Record<string, string>) {
  const e = reviewEntry(day, answers);
  if (e.text) await store.update("journal", j => [...(j ?? []).filter(x => !(x.day === day && x.area === "review")), e]);
  const done = (store.get("stats")?.sessions ?? []).some(s => s.day === day && s.area === "review");
  if (!done) await store.set("stats", completeSession(store.get("stats"), { day, area: "review", steps: ["Review"], minutes: 10, lumens: REVIEW_LUMENS, at: Date.now() }));
}

function Stat({ n, label }: { n: string | number; label: string }) {
  return <div className="flex flex-col"><span className="tabular font-display text-[30px] leading-none">{n}</span><span className="text-[12.5px] text-muted">{label}</span></div>;
}

export default function Review() {
  const s = useStore();
  const p = s.get("profile")!;
  const [day] = useState(() => today());
  const w = weekSummary({ stats: s.get("stats"), drills: s.get("drills"), reading: s.get("reading"), library: s.get("library"), progress: s.get("progress") }, day);
  const saved = (s.get("journal") ?? []).find(j => j.day === day && j.area === "review");
  const doneToday = (s.get("stats")?.sessions ?? []).some(x => x.day === day && x.area === "review");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [finished, setFinished] = useState(false);
  const name = (id: string) => p.areas.find(a => a.id === id)?.name ?? id;
  const active = p.areas.filter(a => a.cat !== "news" && a.freq !== "Paused");
  const lastWeek = (s.get("journal") ?? []).filter(j => j.area === "review" && j.day < day && j.day >= addDays(day, -8)).at(-1);
  const toggleStar = (id: string) => store.set("profile", { ...p, areas: p.areas.map(a => (a.id === id ? { ...a, star: !a.star } : a)) });

  return (
    <>
      <PageTitle title="Weekly review" sub={`${fmt(w.from)} to ${fmt(w.to)}. Look back, then set up next week.`} />
      <div className="flex flex-col gap-3.5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-8">
        <div className="flex flex-col gap-3.5">
          <SectionTitle>Your week</SectionTitle>
          <Card className="flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-3">
              <Stat n={`${w.days}/6`} label="days with a session" />
              <Stat n={w.minutes} label="minutes" />
              <Stat n={w.drills} label="drills played" />
            </div>
            {w.areas.length > 0 ? (
              <ul className="flex flex-col">{w.areas.map(a => <li key={a.area} className="flex justify-between border-t border-border py-2 text-[14px] first:border-t-0"><span>{name(a.area)}</span><span className="text-muted">{a.sessions} session{a.sessions === 1 ? "" : "s"}</span></li>)}</ul>
            ) : <p className="text-[13.5px] text-muted">No sessions this week. That&apos;s fine: today is a fresh start.</p>}
            <p className="border-t border-border pt-3 text-[13px] text-muted">
              {[w.quizzes.out ? `Quizzes: ${w.quizzes.right} of ${w.quizzes.out} right` : "", w.highlights ? `${w.highlights} highlight${w.highlights === 1 ? "" : "s"}` : "", w.finished ? `${w.finished} book${w.finished === 1 ? "" : "s"} finished` : "", w.picksDone ? `${w.picksDone} pick${w.picksDone === 1 ? "" : "s"} finished` : ""].filter(Boolean).join(" · ") || "Practice, reading and picks you finish show up here."}
            </p>
          </Card>

          <SectionTitle right="Starred areas come up twice as often">Next week</SectionTitle>
          <Card className="flex flex-col gap-2">
            <p className="text-[13.5px] text-muted">Star what you want more of next week.</p>
            <div className="flex flex-wrap gap-2">{active.map(a => (
              <button key={a.id} aria-pressed={a.star} onClick={() => toggleStar(a.id)} className={cn("rounded-full border px-3 py-1 text-[13.5px]", a.star ? "border-gold text-fg" : "border-border text-muted hover:text-fg")}>{a.star ? "★ " : ""}{a.name}</button>
            ))}</div>
          </Card>
        </div>

        <div className="flex flex-col gap-3.5">
          <SectionTitle right="Private, never sent to AI">Reflect</SectionTitle>
          {finished || (doneToday && saved) ? (
            <Card className="flex flex-col gap-3">
              <p className="font-display text-[26px]">Week reviewed.</p>
              <p className="text-[14px] text-muted">{finished ? `+${REVIEW_LUMENS} lumens, and your streak carries on.` : "You've done this week's review."}</p>
              {saved && <p className="whitespace-pre-line rounded-[10px] bg-surface-2 p-3 text-[13.5px]">{saved.text}</p>}
              <Link href="/today" className="self-start rounded-full bg-primary px-4 py-2 text-[14px] font-medium text-on-primary">Back to Today</Link>
            </Card>
          ) : (
            <Card className="flex flex-col gap-3">
              {lastWeek && <p className="rounded-[10px] bg-surface-2 p-3 text-[13px]"><span className="eyebrow block">Last week you said</span><span className="whitespace-pre-line">{lastWeek.text.split("\n\n").find(t => t.startsWith(REVIEW_PROMPTS[2].label))?.split("\n").slice(1).join(" ") ?? lastWeek.text.slice(0, 200)}</span></p>}
              {REVIEW_PROMPTS.map(q => (
                <div key={q.key} className="flex flex-col gap-1.5">
                  <label htmlFor={`rv-${q.key}`} className="text-[14px] font-medium">{q.label}</label>
                  <textarea id={`rv-${q.key}`} rows={3} value={answers[q.key] ?? ""} onChange={e => setAnswers(a => ({ ...a, [q.key]: e.target.value }))} className="rounded-[10px] border border-border bg-surface px-3 py-2 text-[14px]" />
                </div>
              ))}
              <Button className="self-start" onClick={async () => { await finishReview(day, answers); setFinished(true); }}>Finish the review</Button>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
