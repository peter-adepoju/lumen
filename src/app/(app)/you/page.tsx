"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CATEGORY_NAME, makeArea, PLAN_MODES, SESSION_PARTS, type Block, type Freq, type Profile } from "@/lib/model";
import { googleSignInUrl, signOut, useMe } from "@/lib/auth-client";
import { store, useStore } from "@/lib/store/store";
import { useTheme } from "@/lib/theme";
import { KeyForm } from "@/components/key-form";
import { NewsSources } from "@/components/news";
import Link from "next/link";
import { SyncDot } from "@/components/sync-dot";
import { Button, Card, Chip, cn, PageTitle, Row, Segmented, Switch } from "@/components/ui";

const FREQS: Freq[] = ["Daily", "Weekly", "Sometimes", "Paused"];

export default function You() {
  const s = useStore();
  const me = useMe();
  const router = useRouter();
  const [theme, setTheme] = useTheme();
  const p = s.get("profile")!;
  const ai = s.get("ai");
  const blocked = s.get("blocked") ?? [];
  const [editKey, setEditKey] = useState(false);
  const [newArea, setNewArea] = useState("");
  const [word, setWord] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);

  const saveProfile = (patch: Partial<Profile>) => store.set("profile", { ...p, ...patch });
  const setArea = (id: string, patch: Partial<Profile["areas"][number]>) => saveProfile({ areas: p.areas.map(a => (a.id === id ? { ...a, ...patch } : a)) });
  const setBlocked = (b: Block[]) => store.set("blocked", b);

  function exportData() {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), ...store.exportAll(), ai: { mode: ai?.mode } }, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "lumen-data.json"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  return (
    <>
      <PageTitle title="You" sub="Your tools, your areas and your settings." />
      <div className="flex flex-col gap-3.5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
      <div className="flex flex-col gap-3.5 lg:gap-6">

      <Card className="flex flex-col">
        <span className="eyebrow mb-1">Your tools</span>
        <Row>
          <div className="min-w-0 flex-1">
            <p className="font-medium">Storage · {s.mode === "google" ? "Google Drive" : "This device"}</p>
            <p className="truncate text-[12.5px] text-muted">{s.mode === "google" && me?.user ? `Lumen folder in ${me.user.email}'s Drive` : "Only on this device. Connect Google to keep it safe and use it everywhere."}</p>
            <SyncDot showLabel />
          </div>
          {s.mode === "google"
            ? <Button variant="ghost" size="sm" onClick={() => store.sync()}>Sync now</Button>
            : me?.googleConfigured && <a href={googleSignInUrl("/you")} className="rounded-full border border-border px-3 py-1 text-[13px] font-medium hover:bg-surface-2">Connect</a>}
        </Row>
        <div id="ai" className="flex flex-col gap-3 border-t border-border py-2.5">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">AI · Gemini</p>
              <p className="text-[12.5px] text-muted">{ai?.mode === "own" ? `Your own key${ai.connectedAt ? `, connected ${new Date(ai.connectedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""} · your own free allowance` : "Not connected. AI features are off."}</p>
            </div>
            <Button variant={ai?.mode === "own" ? "ghost" : "primary"} size="sm" onClick={() => setEditKey(v => !v)}>{editKey ? "Cancel" : ai?.mode === "own" ? "Change key" : "Connect"}</Button>
          </div>
          {editKey && <KeyForm onDone={() => setEditKey(false)} />}
          {ai?.mode === "own" && !editKey && <button className="self-start text-[12.5px] text-muted underline underline-offset-4" onClick={() => store.set("ai", { mode: "none" })}>Remove my key</button>}
        </div>
      </Card>

      <Card className="flex flex-col">
        <div className="mb-1 flex items-baseline justify-between"><span className="eyebrow">Your areas</span><span className="text-[12px] text-muted">{p.areas.length}</span></div>
        <p className="mb-1 text-[13px] text-muted">Star what matters most: starred areas come up twice as often.</p>
        {p.areas.map(a => (
          <Row key={a.id}>
            <button aria-label={a.star ? `Unstar ${a.name}` : `Star ${a.name}`} aria-pressed={a.star} onClick={() => setArea(a.id, { star: !a.star })} className={cn("text-[17px]", a.star ? "text-gold" : "text-border hover:text-muted")}>★</button>
            <div className="min-w-0 flex-1"><p className="truncate">{a.name}</p><p className="text-[12px] text-muted">{CATEGORY_NAME[a.cat]}</p></div>
            <label className="sr-only" htmlFor={`f-${a.id}`}>How often</label>
            <select id={`f-${a.id}`} value={a.freq} onChange={e => setArea(a.id, { freq: e.target.value as Freq })} className="rounded-[8px] border border-border bg-surface-2 px-2 py-1 text-[13px]">
              {FREQS.map(f => <option key={f}>{f}</option>)}
            </select>
            <button aria-label={`Remove ${a.name}`} onClick={() => saveProfile({ areas: p.areas.filter(x => x.id !== a.id) })} className="grid size-7 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-danger">×</button>
          </Row>
        ))}
        <form className="mt-2 flex gap-2" onSubmit={e => { e.preventDefault(); const v = newArea.trim(); if (v && !p.areas.some(a => a.name.toLowerCase() === v.toLowerCase())) saveProfile({ areas: [...p.areas, makeArea(v, "interest")] }); setNewArea(""); }}>
          <label htmlFor="new-area" className="sr-only">New area</label>
          <input id="new-area" value={newArea} onChange={e => setNewArea(e.target.value)} placeholder="Add an area, e.g. Guitar or Excel" className="min-w-0 flex-1 rounded-[10px] border border-border bg-surface px-3 py-2" />
          <Button variant="ghost" size="sm" type="submit">Add</Button>
        </form>
        <button className="mt-3 self-start text-[12.5px] text-muted underline underline-offset-4" onClick={() => router.push("/setup?step=2")}>Run setup again</button>
      </Card>

      </div>
      <div className="flex flex-col gap-3.5 lg:gap-6">
      <Card className="flex flex-col gap-1">
        <span className="eyebrow mb-1">Your day</span>
        <div className="flex flex-wrap items-center justify-between gap-2 py-1.5"><span>Session length</span>
          <Segmented label="Session length" value={p.minutes} onChange={m => saveProfile({ minutes: m })} options={[10, 20, 30, 45].map(m => ({ value: m, label: `${m}m` }))} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 py-1.5"><label htmlFor="plan-mode">Planning</label>
          <select id="plan-mode" value={p.planMode} onChange={e => saveProfile({ planMode: e.target.value as Profile["planMode"] })} className="rounded-[8px] border border-border bg-surface-2 px-2 py-1 text-[13px]">
            {PLAN_MODES.map(m => <option key={m.mode}>{m.mode}</option>)}
          </select>
        </div>
        {SESSION_PARTS.map((part, i) => (
          <Row key={part}><label htmlFor={`part-${i}`} className="flex-1">{part}</label><Switch id={`part-${i}`} label={part} checked={p.steps[part]} onChange={v => saveProfile({ steps: { ...p.steps, [part]: v } })} /></Row>
        ))}
      </Card>

      <Card className="flex flex-col">
        <div className="mb-1 flex items-baseline justify-between"><span className="eyebrow">Blocked</span><span className="text-[12px] text-muted">{blocked.length}</span></div>
        <p className="mb-1 text-[13px] text-muted">Lumen never shows these again, and learns from why you blocked them.</p>
        {blocked.length === 0 && <p className="py-1 text-[13px] text-muted">Nothing blocked yet.</p>}
        {blocked.map((b, i) => (
          <Row key={b.type + b.value}>
            <Chip>{b.type === "item" ? "Item" : b.type === "creator" ? "Creator" : b.type === "platform" ? "Platform" : "Topic"}</Chip>
            <span className="min-w-0 flex-1 truncate">{b.value}{b.reason && <span className="block text-[12px] text-muted">{b.reason}</span>}</span>
            <Button variant="ghost" size="sm" onClick={() => setBlocked(blocked.filter((_, j) => j !== i))}>Unblock</Button>
          </Row>
        ))}
        <form className="mt-2 flex gap-2" onSubmit={e => { e.preventDefault(); const v = word.trim(); if (v && !blocked.some(b => b.value.toLowerCase() === v.toLowerCase())) setBlocked([{ type: "topic", value: v, reason: "Blocked by you", at: Date.now() }, ...blocked]); setWord(""); }}>
          <label htmlFor="block-word" className="sr-only">Block a word or topic</label>
          <input id="block-word" value={word} onChange={e => setWord(e.target.value)} placeholder="Block a word or topic, e.g. crypto" className="min-w-0 flex-1 rounded-[10px] border border-border bg-surface px-3 py-2" />
          <Button variant="ghost" size="sm" type="submit">Block</Button>
        </form>
      </Card>

      {p.areas.some(a => a.cat === "news") && <NewsSources topics={p.areas.filter(a => a.cat === "news")} />}

      <Card className="flex items-center justify-between gap-3">
        <div className="flex flex-col"><span className="eyebrow">Unwind</span><Link href="/unwind" className="text-[13px] underline underline-offset-4">Weekend films and series</Link></div>
      </Card>

      <Card className="flex items-center justify-between gap-3">
        <span className="eyebrow">Theme</span>
        <Segmented label="Theme" value={theme} onChange={setTheme} options={[{ value: "auto", label: "Auto" }, { value: "light", label: "Day" }, { value: "dark", label: "Night" }]} />
      </Card>

      <Card className="flex flex-col gap-3">
        <span className="eyebrow">Your data</span>
        <p className="text-[13px] text-muted">Lumen is free. Your data lives in your own Drive and on your devices. Lumen&apos;s server keeps only your sign-in.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={exportData}>Export my data</Button>
          {me?.user && <Button variant="ghost" size="sm" onClick={async () => { await signOut(); await store.useMode("device"); router.refresh(); location.reload(); }}>Sign out</Button>}
          {confirmClear
            ? <Button size="sm" className="bg-danger text-white" onClick={async () => { await store.clearDevice(); if (me?.user) await signOut(); router.push("/setup"); }}>Yes, clear this device</Button>
            : <Button variant="ghost" size="sm" onClick={() => setConfirmClear(true)}>Clear this device</Button>}
        </div>
        {confirmClear && <p className="text-[12.5px] text-muted">This removes Lumen from this device only. Anything already synced stays in your Drive. <button className="underline underline-offset-4" onClick={() => setConfirmClear(false)}>Keep it</button></p>}
      </Card>
      </div>
      </div>
    </>
  );
}
