"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AREA_LIBRARY, defaultProfile, FORMATS, makeArea, PLAN_MODES, type Area, type Category, type Format, type PlanMode } from "@/lib/model";
import { weekPlan } from "@/lib/plan";
import { googleSignInUrl, useMe } from "@/lib/auth-client";
import { store, useStore } from "@/lib/store/store";
import { KeyForm } from "./key-form";
import { Button, Card, cn, Pill, Segmented } from "./ui";

const STEPS = 6;
const GOAL_HINTS = ["Get promoted", "Change careers", "Pass an exam", "Move abroad", "Start a business", "Just grow"];
const GOOGLE_PROBLEMS: Record<string, string> = {
  declined: "Google sign-in was cancelled. You can try again, or use Lumen on this device only for now.",
  expired: "That sign-in took too long. Please try again.",
  "no-drive": "Lumen needs permission for its own Drive folder to save your data. Please try again and leave the Drive box ticked.",
  "no-offline": "Google didn't give Lumen lasting access. Please try again.",
  error: "Something went wrong with Google sign-in. Please try again.",
  "not-configured": "Google sign-in isn't set up on this server yet.",
};

function readQuery() {
  if (typeof window === "undefined") return { step: 0, problem: null as string | null };
  const q = new URLSearchParams(window.location.search);
  const st = Number(q.get("step")), g = q.get("google");
  return { step: st >= 0 && st < STEPS ? st : 0, problem: g ? GOOGLE_PROBLEMS[g] ?? GOOGLE_PROBLEMS.error : null };
}

export function Setup() {
  const s = useStore();
  useEffect(() => { store.init(); }, []);
  if (!s.loaded) return <main className="grid min-h-dvh place-items-center"><div className="orb size-12" aria-label="Loading" /></main>;
  return <SetupFlow />;
}

function SetupFlow() {
  const router = useRouter();
  const s = useStore();
  const me = useMe();
  const existing = s.get("profile");
  const [step, setStep] = useState(() => readQuery().step);
  const [problem, setProblem] = useState<string | null>(() => readQuery().problem);
  const [picks, setPicks] = useState<Area[]>(() => existing?.areas ?? []);
  const [custom, setCustom] = useState("");
  const [goal, setGoal] = useState(() => existing?.goal ?? "");
  const [formats, setFormats] = useState<Format[]>(() => existing?.formats ?? defaultProfile().formats);
  const [minutes, setMinutes] = useState(() => existing?.minutes ?? 20);
  const [mode, setMode] = useState<PlanMode>(() => existing?.planMode ?? "Lumen plans each day");

  // Coming back signed in: from now on, save to Drive.
  useEffect(() => { if (me?.user && s.mode !== "google") store.useMode("google"); }, [me, s.mode]);

  const go = (n: number) => { setStep(n); setProblem(null); window.scrollTo(0, 0); history.replaceState(null, "", `/setup?step=${n}`); };
  const toggle = (name: string, cat: Category) =>
    setPicks(p => (p.some(a => a.name === name) ? p.filter(a => a.name !== name) : [...p, makeArea(name, cat)]));

  async function finish() {
    const areas = picks.map((a, i) => ({ ...a, star: picks.some(x => x.star) ? a.star : i === 0 }));
    const base = existing ?? defaultProfile();
    await store.set("profile", { ...base, areas, goal: goal.trim(), formats, minutes, planMode: mode });
    if (!store.get("ai")) await store.set("ai", { mode: "none" });
    if (!store.get("blocked")) await store.set("blocked", []);
    if (!store.get("added")) await store.set("added", []);
    router.push("/today");
  }

  const plan = useMemo(() => weekPlan(picks.map((a, i) => ({ ...a, star: i === 0 })), mode, new Date()), [picks, mode]);
  const customs = picks.filter(a => !AREA_LIBRARY.some(([, , l]) => l.includes(a.name)));

  return (
    <main className="mx-auto flex max-w-[460px] flex-col gap-6 px-4 pb-16 pt-3 [padding-left:max(16px,env(safe-area-inset-left))] [padding-right:max(16px,env(safe-area-inset-right))]">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-4 bg-bg py-3">
        <span className="font-display text-[22px] font-semibold">Lumen</span>
        <div className="flex max-w-[180px] flex-1 gap-1" aria-label={`Step ${step + 1} of ${STEPS}`}>
          {Array.from({ length: STEPS }, (_, i) => <span key={i} className={cn("h-1 flex-1 rounded-full", i <= step ? "bg-gold" : "bg-surface-2")} />)}
        </div>
        {step > 0 ? <button className="text-[13px] text-muted underline underline-offset-4" onClick={() => go(step - 1)}>Back</button> : <span className="w-8" />}
      </div>

      {problem && <p role="alert" className="rounded-[12px] bg-surface-2 px-3 py-2.5 text-[13.5px]">{problem}</p>}

      {step === 0 && (
        <>
          <Intro title="Your Lumen, on your own Google account" text="Lumen runs on your own tools. Your data is saved in your Google Drive, and the AI uses your own free Gemini allowance." />
          <Card className="flex flex-col gap-3.5">
            {[
              ["Your Google Drive", "Books, notes, highlights, progress and what Lumen learns about you go into a Lumen folder in your Drive. Lumen can\u2019t see your other files."],
              ["Your own AI", "Next, you\u2019ll connect a free Gemini key. It takes about a minute."],
              ["Works offline", "A copy stays on this device and syncs to Drive when you\u2019re back online."],
            ].map(([t, d]) => (
              <div key={t} className="flex gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[var(--lang-soft)] text-[13px] font-semibold text-[var(--lang)]">✓</span>
                <div><p className="font-medium">{t}</p><p className="text-[13.5px] text-muted">{d}</p></div>
              </div>
            ))}
          </Card>
          {me?.user ? (
            <>
              <p className="text-[13.5px]">Signed in as <span className="font-medium">{me.user.email}</span>. Your data will be saved to the Lumen folder in this account&apos;s Drive.</p>
              <Button block onClick={() => go(1)}>Continue</Button>
            </>
          ) : me?.googleConfigured ? (
            <>
              <a href={googleSignInUrl("/setup?step=1")} className="inline-flex min-h-10 w-full items-center justify-center gap-2.5 rounded-full border border-border bg-surface px-4 text-[14.5px] font-medium hover:bg-surface-2">
                <GoogleMark /> Continue with Google
              </a>
              <button className="self-center text-[13px] text-muted underline underline-offset-4" onClick={async () => { await store.useMode("device"); go(1); }}>Use on this device only for now</button>
            </>
          ) : me ? (
            <>
              <p className="text-[13.5px] text-muted">Google sign-in isn&apos;t set up on this server yet (see SETUP.md). You can still try Lumen: everything is saved on this device only.</p>
              <Button block onClick={async () => { await store.useMode("device"); go(1); }}>Continue on this device</Button>
            </>
          ) : <p className="text-muted">Checking…</p>}
        </>
      )}

      {step === 1 && (
        <>
          <Intro title="Connect your free AI" text="Lumen's AI runs on Google Gemini. With your own free key you get your own daily allowance instead of sharing one." />
          {s.get("ai")?.mode === "own" ? (
            <>
              <Card><p className="font-medium">✓ Your AI is connected.</p><p className="text-[13.5px] text-muted">You can change the key any time under You.</p></Card>
              <Button block onClick={() => go(2)}>Continue</Button>
            </>
          ) : (
            <>
              <Card><KeyForm onDone={() => go(2)} /></Card>
              <p className="rounded-[12px] bg-surface-2 px-3 py-2.5 text-[13px]"><span className="font-medium">Free is enough for most people.</span> On Google&apos;s free tier, Google may use what you send to improve its products, so your journal is never sent to the AI unless you turn that on.</p>
              <button className="self-center text-[13px] text-muted underline underline-offset-4" onClick={async () => { await store.set("ai", { mode: "none" }); go(2); }}>Skip for now. AI features stay off until you connect a key.</button>
            </>
          )}
        </>
      )}

      {step === 2 && (
        <>
          <Intro title="What should Lumen help you with?" text="Pick anything. You can change all of it later, and Lumen keeps learning what you care about." />
          {AREA_LIBRARY.map(([cat, title, list]) => (
            <section key={cat} className="flex flex-col gap-2">
              <span className="eyebrow">{title}</span>
              <div className="flex flex-wrap gap-2">
                {list.map(name => <Pill key={name} on={picks.some(a => a.name === name)} onClick={() => toggle(name, cat)}>{name}</Pill>)}
              </div>
            </section>
          ))}
          <form className="flex flex-col gap-2" onSubmit={e => { e.preventDefault(); const v = custom.trim(); if (v && !picks.some(a => a.name.toLowerCase() === v.toLowerCase())) setPicks(p => [...p, makeArea(v, "interest")]); setCustom(""); }}>
            <label htmlFor="custom-area" className="eyebrow">Anything else</label>
            <div className="flex gap-2">
              <input id="custom-area" value={custom} onChange={e => setCustom(e.target.value)} placeholder="e.g. Guitar, Bible study, Excel" className="min-w-0 flex-1 rounded-[10px] border border-border bg-surface px-3 py-2" />
              <Button variant="ghost" size="sm" type="submit">Add</Button>
            </div>
            {customs.length > 0 && <div className="flex flex-wrap gap-2">{customs.map(a => <Pill key={a.id} on onClick={() => setPicks(p => p.filter(x => x.id !== a.id))}>{a.name} ×</Pill>)}</div>}
          </form>
          <Button block disabled={!picks.length} onClick={() => go(3)}>{picks.length ? `Continue with ${picks.length}` : "Pick at least one"}</Button>
        </>
      )}

      {step === 3 && (
        <>
          <Intro title="Tell Lumen about you" text="In your own words. Lumen uses this to set your goals, and to decide what to show you and what to leave out." />
          <label htmlFor="goal" className="font-medium">What are you working toward?</label>
          <textarea id="goal" rows={5} value={goal} onChange={e => setGoal(e.target.value)} placeholder="e.g. I want to lead my team next year, speak confidently in meetings, and hold a basic conversation in French by summer." className="rounded-[12px] border border-border bg-surface p-3" />
          <div className="flex flex-wrap gap-2">{GOAL_HINTS.map(h => <Pill key={h} onClick={() => setGoal(g => (g.trim() ? g.trim() + " " : "") + h + ".")}>{h}</Pill>)}</div>
          <Button block onClick={() => go(4)}>Continue</Button>
        </>
      )}

      {step === 4 && (
        <>
          <Intro title="How do you like to learn?" text="Lumen starts here, then adjusts to what you actually finish." />
          <section className="flex flex-col gap-2">
            <span className="eyebrow">Formats</span>
            <div className="flex flex-wrap gap-2">{FORMATS.map(f => <Pill key={f} on={formats.includes(f)} onClick={() => setFormats(x => (x.includes(f) ? x.filter(y => y !== f) : [...x, f]))}>{f}</Pill>)}</div>
          </section>
          <section className="flex flex-col gap-2">
            <span className="eyebrow">Time a day</span>
            <Segmented label="Time a day" value={minutes} onChange={setMinutes} options={[5, 10, 20, 30, 45].map(m => ({ value: m, label: `${m} min` }))} />
          </section>
          <section className="flex flex-col gap-2">
            <span className="eyebrow">How each day is planned</span>
            {PLAN_MODES.map(p => (
              <button key={p.mode} onClick={() => setMode(p.mode)} aria-pressed={mode === p.mode}
                className={cn("rounded-[12px] border px-3.5 py-2.5 text-left transition", mode === p.mode ? "border-success bg-[var(--lang-soft)]" : "border-border bg-surface hover:border-gold")}>
                <span className="font-medium">{p.mode}</span><br /><span className="text-[13px] text-muted">{p.hint}</span>
              </button>
            ))}
          </section>
          <Button block onClick={() => go(5)}>Build my plan</Button>
        </>
      )}

      {step === 5 && (
        <>
          <Intro title="Your plan" text="A starting point. Lumen sharpens it every day from what you finish, rate and score." />
          <Card className="flex flex-col">
            <KV k="Areas" v={picks.filter(a => a.cat !== "news").map(a => a.name).join(", ") || "—"} />
            {picks.some(a => a.cat === "news") && <KV k="News" v={picks.filter(a => a.cat === "news").map(a => a.name).join(", ") + " · trusted sources only"} />}
            <KV k="Each day" v={`${minutes} min · ${mode}`} />
            <KV k="Formats" v={formats.join(", ") || "Any"} />
            {goal.trim() && <KV k="Your goal" v={goal.trim()} />}
          </Card>
          <Card className="flex flex-col">
            <span className="eyebrow mb-1">This week</span>
            {plan.map(d => <KV key={d.date.toISOString()} k={d.label} v={d.date.getDay() === 0 ? "Weekly review" : mode === "I choose each day" ? "Your choice" : d.focus?.name ?? "—"} />)}
          </Card>
          <Button block onClick={finish}>Start with Lumen</Button>
        </>
      )}

      <p className="text-center text-[12.5px] text-muted">Step {step + 1} of {STEPS}</p>
    </main>
  );
}

function Intro({ title, text }: { title: string; text: string }) {
  return <div className="flex flex-col gap-1.5"><h1 className="text-[32px] leading-[1.12]">{title}</h1><p className="text-muted">{text}</p></div>;
}
function KV({ k, v }: { k: string; v: string }) {
  return <div className="grid grid-cols-[110px_1fr] gap-3 border-t border-border py-2 text-[14px] first:border-t-0"><span className="text-muted">{k}</span><span>{v}</span></div>;
}
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
