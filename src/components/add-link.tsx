"use client";
import { useState } from "react";
import { classify } from "@/lib/links";
import { logActivity } from "@/lib/activity";
import { store, useStore } from "@/lib/store/store";
import { Button, Card } from "./ui";

/** Paste a link: Lumen checks it, saves it to Learn, and learns from it. */
export function AddLink() {
  const s = useStore();
  const p = s.get("profile")!;
  const added = s.get("added") ?? [];
  const [url, setUrl] = useState("");
  const [area, setArea] = useState("");
  const [why, setWhy] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const info = classify(url.trim());
    if (!info) { setMsg("Paste a full link, starting with https://"); return; }
    setBusy(true); setMsg(null);
    let title = "", creator = "";
    try {
      const r = await fetch("/api/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: [{ url: url.trim() }] }) });
      const v = r.ok ? (await r.json()).items?.[0] : null;
      if (v) { title = v.title; creator = v.creator; }
    } catch {}
    const guess = p.areas.find(a => new RegExp(`\\b${a.name.split(" ")[0]}`, "i").test(`${title} ${why} ${url}`));
    await store.update("added", list => [{ url: info.canonical, source: info.platform, area: area || guess?.name || "General", why: why.trim() || undefined, creator: creator || undefined, title: title || undefined, at: Date.now() }, ...(list ?? []).filter(x => x.url !== info.canonical)].slice(0, 300));
    logActivity("add", `${title || info.canonical}${creator ? ` (${creator})` : ""}${why.trim() ? ` — ${why.trim()}` : ""}`, area || guess?.name);
    setBusy(false); setUrl(""); setWhy(""); setArea("");
    setMsg(title ? `Added “${title}”. Lumen will look for more like it.` : `Added from ${info.platform}. Lumen will learn from it.`);
  }

  return (
    <Card className="flex flex-col gap-3">
      <form onSubmit={add} className="flex flex-col gap-2">
        <div className="flex gap-2">
          <label htmlFor="add-url" className="sr-only">Link</label>
          <input id="add-url" value={url} onChange={e => { setUrl(e.target.value); setMsg(null); }} inputMode="url" placeholder="Paste a link from YouTube, TikTok, a podcast…" className="min-w-0 flex-1 rounded-[10px] border border-border bg-surface px-3 py-2 text-[14px]" />
          <Button size="sm" type="submit" disabled={!url.trim() || busy}>{busy ? "Checking…" : "Add"}</Button>
        </div>
        {url.trim() && (
          <div className="flex flex-wrap gap-2">
            <label htmlFor="add-area" className="sr-only">For which area</label>
            <select id="add-area" value={area} onChange={e => setArea(e.target.value)} className="rounded-[8px] border border-border bg-surface-2 px-2 py-1.5 text-[13px]">
              <option value="">Let Lumen decide</option>
              {p.areas.map(a => <option key={a.id}>{a.name}</option>)}
            </select>
            <label htmlFor="add-why" className="sr-only">Why it&apos;s useful</label>
            <input id="add-why" value={why} onChange={e => setWhy(e.target.value)} placeholder="Why it's useful (optional)" className="min-w-[150px] flex-1 rounded-[10px] border border-border bg-surface px-3 py-1.5 text-[13px]" />
          </div>
        )}
        {msg && <p className="text-[13px] text-muted" role="status">{msg}</p>}
      </form>
      {added.length > 0 && (
        <div>
          <span className="eyebrow">Added by you</span>
          {added.slice(0, 6).map(a => (
            <div key={a.url} className="flex items-center gap-2 border-t border-border py-2 text-[13px] first:border-t-0">
              <a href={a.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate hover:underline">{a.title ?? a.url}</a>
              <span className="shrink-0 text-muted">{a.area}</span>
              <button aria-label="Remove" onClick={() => store.update("added", l => (l ?? []).filter(x => x.url !== a.url))} className="grid size-6 place-items-center rounded-full text-muted hover:bg-surface-2">×</button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
