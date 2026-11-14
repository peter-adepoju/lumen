"use client";
import { useEffect, useRef, useState } from "react";
import type { Category, InterestSuggestion } from "@/lib/model";
import { CATEGORY_NAME } from "@/lib/model";
import { answer, EMPTY_INTERESTS, interestPrompt, openSuggestions, shouldLook, toSuggestions } from "@/lib/interests";
import { aiProblem, generateJson } from "@/lib/gemini";
import { store, useStore } from "@/lib/store/store";
import { Button, Card } from "./ui";

const CATS: Category[] = ["interest", "skill", "lang", "career", "mind", "news"];

/** Asks your own AI which new interests your recent activity shows. Returns how many it found. */
export async function lookForInterests(key: string): Promise<number> {
  const profile = store.get("profile"), activity = store.get("activity") ?? [], state = store.get("interests") ?? EMPTY_INTERESTS;
  if (!profile || activity.length < 3) return 0;
  const declined = state.suggestions.filter(s => s.status === "no").map(s => s.name);
  const raw = await generateJson<unknown>(key, interestPrompt(profile, activity, declined));
  const found = toSuggestions(raw, profile, state);
  await store.update("interests", cur => {
    const c = cur ?? EMPTY_INTERESTS;
    const keep = c.suggestions.filter(s => !found.some(f => f.id === s.id));
    return { lastRun: Date.now(), lastCount: activity.length, suggestions: [...keep, ...found].slice(-60) };
  });
  return found.length;
}

function Ask({ s }: { s: InterestSuggestion }) {
  const [cat, setCat] = useState<Category>(s.cat);
  const reply = async (r: "yes" | "later" | "no") => {
    const out = answer(store.get("interests"), s.id, r, cat);
    await store.set("interests", out.state);
    const p = store.get("profile");
    if (out.area && p && !p.areas.some(a => a.id === out.area!.id)) await store.set("profile", { ...p, areas: [...p.areas, out.area] });
  };
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3 first:border-t-0 first:pt-0">
      <p className="text-[15px]">Lumen noticed you&apos;re into <span className="font-display text-[20px]">{s.name}</span></p>
      {s.why && <p className="text-[13.5px] text-muted">{s.why}</p>}
      {s.evidence.length > 0 && <ul className="flex flex-wrap gap-1.5">{s.evidence.map(e => <li key={e} className="max-w-full truncate rounded-full border border-border px-2.5 py-0.5 text-[12px] text-muted">{e}</li>)}</ul>}
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-[12.5px] text-muted" htmlFor={`cat-${s.id}`}>Add it under</label>
        <select id={`cat-${s.id}`} value={cat} onChange={e => setCat(e.target.value as Category)} className="rounded-[8px] border border-border bg-surface-2 px-2 py-1 text-[13px]">
          {CATS.map(c => <option key={c} value={c}>{CATEGORY_NAME[c]}</option>)}
        </select>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => void reply("yes")}>Yes, add it</Button>
        <Button size="sm" variant="ghost" onClick={() => void reply("later")}>Ask me later</Button>
        <button onClick={() => void reply("no")} className="ml-auto text-[12.5px] text-muted underline underline-offset-4 hover:text-fg">No, don&apos;t ask again</button>
      </div>
    </div>
  );
}

/**
 * New interests Lumen noticed in what you save, like, search for and finish. It looks now and then
 * (with your own AI key) and never adds anything without your yes. `manual` shows a "Look now" button.
 */
export function InterestNotice({ manual }: { manual?: boolean }) {
  const st = useStore();
  const ai = st.get("ai");
  const key = ai?.mode === "own" ? ai.key : undefined;
  const state = st.get("interests");
  const activity = st.get("activity");
  const open = openSuggestions(state);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (!key || ran.current || !shouldLook(state, activity)) return;
    ran.current = true;
    void lookForInterests(key).catch(() => {});
  }, [key, state, activity]);

  if (!manual && !open.length) return null;
  const added = (state?.suggestions ?? []).filter(s => s.status === "added");
  return (
    <Card className="flex flex-col gap-3">
      {manual && (
        <div className="flex flex-col gap-1">
          <span className="eyebrow">Interests Lumen noticed</span>
          <p className="text-[13px] text-muted">Your interests start with the ones you picked at setup. As you save, like, search and finish things, your own AI looks for new interests that keep coming up, and asks you before adding any. {activity?.length ? `${activity.length} things noted so far.` : "Nothing noted yet."}</p>
        </div>
      )}
      {open.map(s => <Ask key={s.id} s={s} />)}
      {manual && !open.length && <p className="text-[13.5px] text-muted">Nothing new to ask about right now.</p>}
      {manual && added.length > 0 && <p className="text-[12.5px] text-muted">Added after asking you: {added.map(s => s.name).join(", ")}</p>}
      {manual && (
        <div className="flex flex-wrap items-center gap-2">
          {key ? <Button size="sm" variant="ghost" disabled={busy || (activity?.length ?? 0) < 3} onClick={async () => {
            setBusy(true); setMsg(null);
            try { const n = await lookForInterests(key); setMsg(n ? `Found ${n} to ask you about.` : "Nothing clear yet. Keep saving and liking things."); }
            catch (e) { setMsg(aiProblem(e, "Couldn't look right now. Try again later.")); }
            setBusy(false);
          }}>{busy ? "Looking…" : "Look now"}</Button> : <span className="text-[13px] text-muted">Connect your Gemini key to turn this on.</span>}
          {(activity?.length ?? 0) > 0 && <button onClick={() => { if (confirm("Forget what Lumen has noted about your activity? Your interests stay as they are.")) void store.set("activity", []); }} className="ml-auto text-[12.5px] text-muted underline underline-offset-4 hover:text-fg">Forget my activity</button>}
          {msg && <p className="w-full text-[13px] text-muted" role="status">{msg}</p>}
        </div>
      )}
    </Card>
  );
}
