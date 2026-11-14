"use client";
import Link from "next/link";
import { useState } from "react";
import { CATEGORY_NAME } from "@/lib/model";
import { dailyExtras, focusFor, greeting, isReviewDay, weekPlan } from "@/lib/plan";
import { useStore } from "@/lib/store/store";
import { currentStreak, level } from "@/lib/stats";
import { today } from "@/lib/recs";
import { Card, Chip, cn, Pill, SectionTitle } from "@/components/ui";
import { SyncDot } from "@/components/sync-dot";
import { TodaysReading } from "@/components/books";
import { LightOrb, useLight } from "@/components/light";
import { NewsBrief } from "@/components/news";
import { LanguageFilms, UnwindList } from "@/components/unwind";
import { unwindTime } from "@/lib/practice-ai";

export default function Today() {
  const s = useStore();
  const p = s.get("profile")!;
  const ai = s.get("ai");
  const stats = s.get("stats");
  const day = today();
  const streak = stats ? currentStreak(stats, day) : 0;
  const doneToday = stats?.lastDay === day;
  const reviewed = (stats?.sessions ?? []).some(x => x.day === day && x.area === "review");
  const lv = level(stats?.lumens ?? 0);
  const l = useLight();
  // This page renders only on the device (after the store loads), so reading the clock and storage up front is safe.
  const [now] = useState(() => new Date());
  const [choice, setChoice] = useState<string | null>(() => { try { return localStorage.getItem("lumen:choice:" + new Date().toDateString()); } catch { return null; } });

  const chosen = p.planMode === "I choose each day" ? p.areas.find(a => a.id === choice) ?? null : null;
  const focus = p.planMode === "I choose each day" ? chosen : focusFor(p.areas, p.planMode, now);
  const extras = dailyExtras(p.areas, focus);
  const week = weekPlan(p.areas, p.planMode, now);
  const news = p.areas.filter(a => a.cat === "news" && a.freq !== "Paused");
  const pick = (id: string) => { setChoice(id); try { localStorage.setItem("lumen:choice:" + now.toDateString(), id); } catch {} };
  const dayName = (d: Date) => (d.getDay() === 0 ? "Weekly review" : p.planMode === "I choose each day" ? "Your choice" : weekFocus(d) ?? "—");
  const weekFocus = (d: Date) => week.find(w => w.date.toDateString() === d.toDateString())?.focus?.name;

  return (
    <>
      {/* Phone: a compact app header. On the web the site header above does this job. */}
      <div className="flex items-center justify-between lg:hidden">
        <span className="font-display text-[22px] font-semibold">Lumen</span>
        <div className="flex items-center gap-2">
          <SyncDot />
          <Link href="/you" aria-label="You and settings" className="grid size-9 place-items-center rounded-full border border-border hover:bg-surface-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden><circle cx="12" cy="8.5" r="4" /><path d="M4 20.5c1.5-4 4.5-5.5 8-5.5s6.5 1.5 8 5.5" /></svg>
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-3.5 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-8">
        <div className="flex flex-col gap-3.5 lg:gap-6">
          {/* Greeting: a card on phones, an open page heading on the web */}
          <Card className="flex items-start justify-between gap-3 bg-[linear-gradient(170deg,var(--gold-soft),transparent_80%),var(--surface)] lg:border-0 lg:bg-none lg:bg-transparent lg:px-0 lg:pb-2 lg:pt-0">
            <div className="flex flex-col gap-1">
              <span className="eyebrow">{now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</span>
              <h1 className="text-[32px] leading-[1.1] lg:text-[52px] lg:leading-[1.05]">{greeting(now)}</h1>
              <p className="text-[13.5px] text-muted lg:text-[15px]">{p.minutes} minutes today · <span className="tabular">{(stats?.lumens ?? 0).toLocaleString("en-GB")}</span> lumens · {lv.name}</p>
            </div>
            <div className="flex flex-col items-center gap-1 pt-1">
              <Link href="/progress#light" aria-label={`Your light: ${l.label}. ${l.detail} See how it works.`} className="grid place-items-center p-1">
                <LightOrb l={l} decorative className="size-11 lg:size-16" />
              </Link>
              <span className="max-w-[120px] text-center text-[11px] leading-tight text-muted lg:max-w-[150px] lg:text-[12px]">
                {l.state === "new" ? l.label : <><span className="font-medium text-fg">{l.label}</span>{streak ? <><br /><span className="tabular">{streak}</span> {streak === 1 ? "day" : "days"} of light</> : null}</>}
              </span>
            </div>
          </Card>

          <Card className="flex flex-col gap-3 lg:gap-4 lg:p-7">
            {isReviewDay(now) ? (
              <>
                <Chip>Weekly review</Chip>
                <h2 className="text-[25px] lg:text-[34px]">Look back on your week</h2>
                <p className="text-[14px] text-muted">Sunday is for reflection: what went well, what was hard, and one focus for next week.</p>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                  <p className="text-[13px] text-muted">{reviewed ? "✓ Week reviewed. Enjoy your Sunday." : "About 10 minutes · keeps your streak"}</p>
                  {reviewed ? <Link href="/review" className="rounded-full border border-border px-3.5 py-1.5 text-[13.5px] font-medium hover:bg-surface-2">See your review</Link>
                    : <Link href="/review" className="rounded-full bg-primary px-4 py-2 text-[14px] font-medium text-on-primary hover:opacity-90">Start the review</Link>}
                </div>
              </>
            ) : p.planMode === "I choose each day" && !focus ? (
              <>
                <span className="eyebrow">Choose today&apos;s focus</span>
                <div className="flex flex-wrap gap-2">{p.areas.filter(a => a.cat !== "news" && a.freq !== "Paused").map(a => <Pill key={a.id} onClick={() => pick(a.id)}>{a.name}</Pill>)}</div>
              </>
            ) : focus ? (
              <>
                <div className="flex items-center justify-between"><Chip cat={focus.cat}>{CATEGORY_NAME[focus.cat]} day</Chip>{focus.star && <span className="text-[12px] text-gold">★ Starred</span>}</div>
                <h2 className="text-[26px] lg:text-[38px]">{focus.name}</h2>
                {extras.length > 0 && <p className="text-[13.5px] text-muted">Also every day: {extras.map(a => a.name).join(", ")}</p>}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                  <p className="text-[13px] text-muted">{doneToday ? "✓ Done for today. Keep going in Learn if you like." : `${["Warm-up", "Learn", "Practise", "Reflect"].filter(x => p.steps[x as keyof typeof p.steps]).join(", ")} · about ${p.minutes} min`}</p>
                  {doneToday ? <Link href="/learn" className="rounded-full border border-border px-3.5 py-1.5 text-[13.5px] font-medium hover:bg-surface-2">Open Learn</Link>
                    : <Link href="/session" className="rounded-full bg-primary px-4 py-2 text-[14px] font-medium text-on-primary hover:opacity-90">Start today&apos;s session</Link>}
                </div>
              </>
            ) : (
              <p className="text-[14px] text-muted">No active areas. <Link className="underline underline-offset-4" href="/you">Add or unpause an area</Link>.</p>
            )}
          </Card>
        </div>

        <aside className="flex flex-col gap-3.5 lg:sticky lg:top-24">
          {p.steps["Today's reading"] && <TodaysReading compact />}
          {ai?.mode !== "own" && (
            <Card className="flex items-center justify-between gap-3 lg:flex-col lg:items-start">
              <p className="text-[13.5px]"><span className="font-medium">Connect your free AI</span><br /><span className="text-muted">Picks, feedback and summaries need your own Gemini key.</span></p>
              <Link href="/you#ai" className="shrink-0 rounded-full bg-primary px-3 py-1.5 text-[13px] font-medium text-on-primary">Connect</Link>
            </Card>
          )}

          <SectionTitle right={p.planMode === "I choose each day" ? "You choose" : "Rotation"}>This week</SectionTitle>
          <Card>
            {/* Phone: a compact strip. Web: a readable list. */}
            <div className="grid grid-cols-7 gap-1 lg:hidden">
              {week.map(d => {
                const today = d.date.toDateString() === now.toDateString(), past = d.date < now && !today;
                return (
                  <div key={d.date.toISOString()} title={dayName(d.date)}
                    className={cn("flex flex-col items-center gap-1 rounded-[10px] py-2 text-[11.5px]", today ? "bg-surface-2 font-medium text-fg" : "text-muted", past && "opacity-60")}>
                    <span>{d.label[0]}</span>
                    <span className="max-w-full truncate px-0.5 text-[10.5px]">{d.date.getDay() === 0 ? "Review" : d.focus?.name.split(" ")[0] ?? "·"}</span>
                  </div>
                );
              })}
            </div>
            <ul className="hidden lg:block">
              {week.map(d => {
                const today = d.date.toDateString() === now.toDateString();
                return (
                  <li key={d.date.toISOString()} className={cn("flex items-center justify-between gap-3 border-t border-border py-2 text-[14px] first:border-t-0", today ? "font-medium" : "text-muted")}>
                    <span className="w-24">{d.date.toLocaleDateString("en-GB", { weekday: "long" })}</span>
                    <span className={cn("truncate text-right", today && "text-fg")}>{dayName(d.date)}{today && <span className="ml-2 text-gold">•</span>}</span>
                  </li>
                );
              })}
            </ul>
          </Card>

          {news.length > 0 && p.steps["News brief"] && (
            <>
              <SectionTitle right={<Link href="/news" className="underline underline-offset-4">See all</Link>}>Your news</SectionTitle>
              <NewsBrief topics={news} compact />
            </>
          )}

          {p.steps["Unwind picks"] && unwindTime(now, streak) && (
            <>
              <SectionTitle right={<Link href="/unwind" className="underline underline-offset-4">Unwind</Link>}>Time off</SectionTitle>
              <UnwindList compact />
              {p.areas.some(a => a.cat === "lang" && a.freq !== "Paused") && <LanguageFilms compact />}
            </>
          )}
          {p.steps.Games && (
            <Link href="/play" className="flex items-center justify-between gap-3 rounded-[14px] border border-border bg-surface px-4 py-3 hover:border-gold">
              <span><span className="font-medium">Take a break</span><br /><span className="text-[13px] text-muted">Pairs and Target: quick games that still train something.</span></span>
              <span className="text-[13px] underline underline-offset-4">Play</span>
            </Link>
          )}
        </aside>
      </div>
    </>
  );
}
