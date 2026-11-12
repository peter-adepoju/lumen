"use client";
import Link from "next/link";
import { useState } from "react";
import { CATEGORY_NAME } from "@/lib/model";
import { dailyExtras, focusFor, greeting, isReviewDay, weekPlan } from "@/lib/plan";
import { useStore } from "@/lib/store/store";
import { Card, Chip, cn, Pill, SectionTitle } from "@/components/ui";
import { SyncDot } from "@/components/sync-dot";

export default function Today() {
  const s = useStore();
  const p = s.get("profile")!;
  const ai = s.get("ai");
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
              <p className="text-[13.5px] text-muted lg:text-[15px]">{p.minutes} minutes today · {p.planMode}</p>
            </div>
            <div className="flex flex-col items-center gap-1 pt-1">
              <div className="orb size-11 lg:size-16" aria-hidden />
              <span className="text-[11px] text-muted lg:text-[12px]">Your light starts today</span>
            </div>
          </Card>

          <Card className="flex flex-col gap-3 lg:gap-4 lg:p-7">
            {isReviewDay(now) ? (
              <>
                <Chip>Weekly review</Chip>
                <h2 className="text-[25px] lg:text-[34px]">Look back on your week</h2>
                <p className="text-[14px] text-muted">Sunday is for reflection: what went well, what was hard, and one focus for next week.</p>
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
                <p className="border-t border-border pt-3 text-[13px] text-muted">Daily sessions for {focus.name} (warm-up, a pick, practice and a short reflection) are the next part of Lumen being built.</p>
              </>
            ) : (
              <p className="text-[14px] text-muted">No active areas. <Link className="underline underline-offset-4" href="/you">Add or unpause an area</Link>.</p>
            )}
          </Card>
        </div>

        <aside className="flex flex-col gap-3.5 lg:sticky lg:top-24">
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

          {news.length > 0 && (
            <>
              <SectionTitle right="Trusted sources only">Your news</SectionTitle>
              <Card><p className="text-[14px]">Following {news.map(n => n.name).join(", ")}.</p><p className="text-[13px] text-muted">Your daily brief arrives in a later update.</p></Card>
            </>
          )}
        </aside>
      </div>
    </>
  );
}
