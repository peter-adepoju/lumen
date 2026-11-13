"use client";
import Link from "next/link";
import { useState } from "react";
import type { DrillScore } from "@/lib/model";
import { areaActivity, areaLevel, drillTrend, heatmap, tastes } from "@/lib/progress";
import { currentStreak, level, LEVELS } from "@/lib/stats";
import { today } from "@/lib/recs";
import { store, useStore } from "@/lib/store/store";
import { Button, Card, cn, PageTitle, Row, SectionTitle } from "@/components/ui";
import { LightOrb, useLight } from "@/components/light";
import { learningDays } from "@/lib/light";
import { addDays } from "@/lib/practice";

const fmtDay = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
// One hue, light to dark: minutes of practice on a day.
const shade = (m: number) => (m === 0 ? "var(--surface-2)" : `color-mix(in srgb, var(--gold) ${m < 10 ? 30 : m < 20 ? 55 : m < 40 ? 78 : 100}%, var(--surface))`);

function YourLight() {
  const s = useStore();
  const l = useLight();
  const [day] = useState(() => today());
  const { full, any } = learningDays({ stats: s.get("stats"), drills: s.get("drills"), games: s.get("games"), journal: s.get("journal"), reading: s.get("reading") });
  const days = Array.from({ length: 7 }, (_, i) => addDays(day, i - 6));
  return (
    <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
      <div className="grid place-items-center p-4"><LightOrb l={l} className="size-20" /></div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div><p className="font-display text-[26px] leading-tight">{l.label}</p><p className="text-[13.5px] text-muted">{l.detail}</p></div>
        <div className="flex gap-1.5" role="img" aria-label={`Learned on ${l.week} of the last 7 days`}>
          {days.map(d => (
            <span key={d} title={`${new Date(d + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })}: ${full.has(d) ? "session" : any.has(d) ? "practice or reading" : "no learning"}`}
              className={cn("flex h-7 flex-1 items-center justify-center rounded-[6px] border text-[10.5px]", full.has(d) ? "border-gold bg-gold text-on-primary" : any.has(d) ? "border-gold bg-[var(--gold-soft)]" : "border-border text-muted")}>
              {new Date(d + "T12:00:00").toLocaleDateString("en-GB", { weekday: "narrow" })}
            </span>
          ))}
        </div>
        <details className="text-[13px] text-muted">
          <summary className="cursor-pointer text-fg">How your light works</summary>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
            <li>A session (or the Sunday review) today makes it <strong className="text-fg">shine</strong>. Practice, a game or reading without a session keeps it <strong className="text-fg">lit</strong>, a little less bright.</li>
            <li>If you learned yesterday, it waits for you, still bright.</li>
            <li>Each full day you miss dims it: about two thirds after one day, half after two, a third after three. After a week it is an ember.</li>
            <li>It never goes out. One session relights it.</li>
            <li>The more days you learn in a week, the stronger and faster it glows.</li>
          </ul>
        </details>
      </div>
    </Card>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="flex flex-col gap-0.5">
      <span className="eyebrow">{label}</span>
      <span className="tabular font-display text-[34px] leading-none">{value}</span>
      {sub && <span className="text-[12.5px] text-muted">{sub}</span>}
    </Card>
  );
}

function Trend({ title, unit, scores, lowerIsBetter }: { title: string; unit: string; scores: DrillScore[]; lowerIsBetter?: boolean }) {
  const W = 300, H = 90, P = 8;
  if (scores.length === 0) return <div className="flex flex-col gap-1"><p className="font-medium">{title}</p><p className="text-[13px] text-muted">No scores yet. <Link href="/practice" className="underline underline-offset-4">Play it in Practice</Link>.</p></div>;
  const v = scores.map(s => s.score), lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1;
  const x = (i: number) => (scores.length === 1 ? W / 2 : P + (i * (W - 2 * P)) / (scores.length - 1));
  const y = (s: number) => H - P - ((s - lo) / span) * (H - 2 * P);
  const last = v[v.length - 1], best = lowerIsBetter ? lo : hi;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between"><p className="font-medium">{title}</p><p className="text-[12.5px] text-muted">Latest <span className="tabular text-fg">{last}</span>{unit} · best <span className="tabular text-fg">{best}</span>{unit}</p></div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[90px] w-full" role="img" aria-label={`${title}: ${v.join(", ")}${unit}`}>
        <line x1={P} x2={W - P} y1={H - P} y2={H - P} stroke="var(--border)" strokeWidth="1" />
        {scores.length > 1 && <polyline points={scores.map((s, i) => `${x(i)},${y(s.score)}`).join(" ")} fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
        {scores.map((s, i) => (
          <g key={s.at}>
            <circle cx={x(i)} cy={y(s.score)} r="4" fill="var(--gold)" stroke="var(--surface)" strokeWidth="2" />
            <circle cx={x(i)} cy={y(s.score)} r="12" fill="transparent"><title>{`${fmtDay(s.day)}: ${s.score}${unit}`}</title></circle>
          </g>
        ))}
      </svg>
      <p className="text-[12px] text-muted">{lowerIsBetter ? "Lower is faster." : "Higher is better."} Hover a point for its day.</p>
    </div>
  );
}

export default function Progress() {
  const s = useStore();
  const p = s.get("profile")!;
  const stats = s.get("stats");
  const [day] = useState(() => today());
  const sessions = stats?.sessions ?? [];
  const lv = level(stats?.lumens ?? 0);
  const grid = heatmap(sessions, day, 12);
  const activity = areaActivity(sessions.filter(x => x.area !== "review"));
  const drills = s.get("drills") ?? [];
  const feedback = s.get("feedback") ?? [];
  const added = s.get("added") ?? [];
  const lib = s.get("library") ?? [];
  const reading = s.get("reading") ?? {};
  const cards = s.get("cards") ?? [];
  const t = tastes(feedback);
  const highlights = Object.values(reading).reduce((n, r) => n + (r?.hl?.length ?? 0), 0);
  const minutes = sessions.reduce((n, x) => n + x.minutes, 0);
  const name = (id: string) => p.areas.find(a => a.id === id)?.name ?? id;
  const quizzes = drills.filter(d => d.kind === "quiz");
  const quizPct = quizzes.length ? Math.round((quizzes.reduce((n, q) => n + q.score / (q.out || 1), 0) / quizzes.length) * 100) : null;
  const sites = [...added.reduce((m, a) => m.set(a.source, (m.get(a.source) ?? 0) + 1), new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const forget = (creator: string) => store.update("feedback", f => (f ?? []).filter(x => x.creator !== creator));

  return (
    <>
      <PageTitle title="Progress" sub="How you're growing, and what Lumen has learned about you." />
      <div id="light" className="mb-3.5 scroll-mt-24 lg:mb-6"><YourLight /></div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <Tile label="Streak" value={String(stats ? currentStreak(stats, day) : 0)} sub={`Best ${stats?.best ?? 0} days`} />
        <Tile label="Lumens" value={(stats?.lumens ?? 0).toLocaleString("en-GB")} sub={lv.next ? `${lv.name} · ${lv.toNext.toLocaleString("en-GB")} to ${lv.next}` : lv.name} />
        <Tile label="Sessions" value={String(sessions.length)} sub={`${Math.round(minutes / 6) / 10} hours in all`} />
        <Tile label="Reading" value={String(lib.filter(b => b.shelf === "finished").length)} sub={`books finished · ${highlights} highlights`} />
      </div>

      <div className="mt-3.5 flex flex-col gap-3.5 lg:mt-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-8">
        <div className="flex flex-col gap-3.5">
          <SectionTitle right="Last 12 weeks">Your days</SectionTitle>
          <Card className="flex flex-col gap-3">
            <div className="flex gap-2">
              <div className="grid grid-rows-7 gap-[3px] text-[10px] text-muted" aria-hidden>{["M", "", "W", "", "F", "", "S"].map((d, i) => <span key={i} className="flex h-full items-center leading-none">{d}</span>)}</div>
              <div className="grid flex-1 grid-cols-12 gap-[3px]" role="img" aria-label={`${sessions.filter(x => x.day >= grid[0][0].day).length} sessions in the last 12 weeks`}>
                {grid.map((w, i) => (
                  <div key={i} className="grid grid-rows-7 gap-[3px]">
                    {w.map(d => <span key={d.day} title={d.future ? "" : `${fmtDay(d.day)}: ${d.minutes ? `${d.minutes} min, ${d.sessions} session${d.sessions === 1 ? "" : "s"}` : "no session"}`}
                      className={cn("aspect-square rounded-[3px]", d.day === day && "outline outline-1 outline-offset-1 outline-fg", d.future && "opacity-0")} style={{ background: shade(d.minutes) }} />)}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-end gap-1.5 text-[11px] text-muted">Less{[0, 5, 15, 30, 45].map(m => <span key={m} className="size-2.5 rounded-[2px]" style={{ background: shade(m) }} />)}More</div>
          </Card>

          <SectionTitle right={`Every 5 sessions is a level`}>Your areas</SectionTitle>
          <Card className="flex flex-col">
            {activity.length === 0 && <p className="text-[13.5px] text-muted">Finish a session and your areas show up here.</p>}
            {activity.map(a => {
              const l = areaLevel(a.sessions);
              return (
                <Row key={a.area}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{name(a.area)}</p>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-gold" style={{ width: `${l.pct}%` }} /></div>
                  </div>
                  <span className="text-right text-[12.5px] text-muted"><span className="font-medium text-fg">Level {l.level}</span><br />{a.sessions} sessions · {a.minutes} min</span>
                </Row>
              );
            })}
          </Card>

          <SectionTitle right={LEVELS.map(l => l[0]).join(" · ")}>Your level</SectionTitle>
          <Card className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between"><span className="font-display text-[26px]">{lv.name}</span><span className="text-[12.5px] text-muted">{lv.next ? `${lv.pct}% of the way to ${lv.next}` : "The top level"}</span></div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-gold" style={{ width: `${lv.pct}%` }} /></div>
          </Card>
        </div>

        <div className="flex flex-col gap-3.5">
          <SectionTitle right={`${cards.length} flashcards${quizPct != null ? ` · quizzes ${quizPct}% right` : ""}`}>Practice</SectionTitle>
          <Card className="flex flex-col gap-5">
            <Trend title="Digit span" unit=" digits" scores={drillTrend(drills, "digit-span")} />
            <Trend title="Odd one out" unit="s" scores={drillTrend(drills, "odd-one-out")} lowerIsBetter />
          </Card>

          <SectionTitle right="Edit anything">What Lumen knows about you</SectionTitle>
          <Card className="flex flex-col gap-3">
            {p.goal && <div><p className="eyebrow">Your goal</p><p className="text-[14px]">{p.goal}</p></div>}
            <div>
              <p className="eyebrow mb-1">Creators you like</p>
              {t.liked.length === 0 ? <p className="text-[13px] text-muted">Rate or finish a few picks and Lumen learns who you like.</p> :
                <div className="flex flex-wrap gap-1.5">{t.liked.map(c => (
                  <span key={c.name} className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-0.5 text-[12.5px]">{c.name} <span className="text-muted">{c.n}</span>
                    <button aria-label={`Forget ${c.name}`} className="text-muted hover:text-danger" onClick={() => forget(c.name)}>×</button></span>
                ))}</div>}
            </div>
            {t.disliked.length > 0 && (
              <div>
                <p className="eyebrow mb-1">Less of</p>
                <div className="flex flex-wrap gap-1.5">{t.disliked.map(c => (
                  <span key={c.name} className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-0.5 text-[12.5px]">{c.name}
                    <button aria-label={`Forget ${c.name}`} className="text-muted hover:text-danger" onClick={() => forget(c.name)}>×</button></span>
                ))}</div>
              </div>
            )}
            {sites.length > 0 && <div><p className="eyebrow mb-1">Where you add from</p><p className="text-[13.5px]">{sites.map(([n, c]) => `${n} (${c})`).join(", ")}</p></div>}
            <p className="text-[12.5px] text-muted">Removing a creator here makes Lumen forget your ratings for them. Blocks and areas are on <Link href="/you" className="underline underline-offset-4">You</Link>.</p>
            {feedback.length > 0 && <Button size="sm" variant="ghost" className="self-start" onClick={() => store.set("feedback", [])}>Forget all my ratings</Button>}
          </Card>
        </div>
      </div>
    </>
  );
}
