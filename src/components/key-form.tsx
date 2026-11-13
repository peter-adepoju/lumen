"use client";
import { useState } from "react";
import { AI_STUDIO_URL, checkKey, KEY_PROBLEM, looksLikeKey } from "@/lib/gemini";
import { store } from "@/lib/store/store";
import { Button } from "./ui";

/** The three-step "connect your own free Gemini key" form. */
export function KeyForm({ onDone }: { onDone: () => void }) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const shape = key.trim() ? looksLikeKey(key) : null;

  async function paste() {
    try { setKey((await navigator.clipboard.readText()).trim()); setProblem(null); }
    catch { setProblem("Your browser blocked pasting. Long-press or right-click in the box and choose Paste."); }
  }
  async function connect() {
    setBusy(true); setProblem(null);
    const r = await checkKey(key);
    setBusy(false);
    if (!r.ok) { setProblem(KEY_PROBLEM[r.reason]); return; }
    await store.set("ai", { mode: "own", key: key.trim(), connectedAt: Date.now() });
    setKey("");
    onDone();
  }

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-4">
        <Step n={1} title="Open Google AI Studio" text="Sign in with the same Google account if it asks.">
          <a href={AI_STUDIO_URL} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-[30px] items-center rounded-full border border-border px-3 text-[13px] font-medium hover:bg-surface-2">Open AI Studio ↗</a>
        </Step>
        <Step n={2} title="Tap “Create API key”, then Copy" text="If asked, accept Google's terms and choose “Create API key in new project”. The key starts with AQ. (or AIza for older keys)." />
        <Step n={3} title="Paste it here">
          <div className="mt-2 flex gap-2">
            <label htmlFor="ai-key" className="sr-only">Gemini API key</label>
            <input
              id="ai-key" type="password" autoComplete="off" spellCheck={false} placeholder="AQ.… or AIza…" value={key}
              onChange={e => { setKey(e.target.value); setProblem(null); }}
              className="min-w-0 flex-1 rounded-[10px] border border-border bg-surface px-3 py-2 font-mono text-[14px]"
            />
            <Button variant="ghost" size="sm" onClick={paste}>Paste</Button>
          </div>
          {shape === false && !problem && <p className="mt-2 text-[13px] text-danger">{KEY_PROBLEM.format}</p>}
          {problem && <p role="alert" className="mt-2 text-[13px] text-danger">{problem}</p>}
          <p className="mt-2 text-[12px] text-muted">Your key is saved in your own Google Drive and on this device. Lumen sends it only to Google.</p>
        </Step>
      </ol>
      <Button onClick={connect} disabled={!shape || busy} block>{busy ? "Checking with Google…" : "Connect my AI"}</Button>
    </div>
  );
}

function Step({ n, title, text, children }: { n: number; title: string; text?: string; children?: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-[12px] font-semibold text-on-primary">{n}</span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        {text && <p className="text-[13.5px] text-muted">{text}</p>}
        {children}
      </div>
    </li>
  );
}
