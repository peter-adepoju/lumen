"use client";
import { useEffect, useRef, useState } from "react";
import type { Area, NewsItem, NewsSet, NewsStatus } from "@/lib/model";
import { rankPrompt, toStories, withoutBlocked, type Headline } from "@/lib/news";
import { generateJson } from "@/lib/gemini";
import { today } from "@/lib/recs";
import { store, useStore } from "@/lib/store/store";
import { Button, Card, cn } from "./ui";

const STATUS_STYLE: Record<NewsStatus, string> = {
  Confirmed: "border-success text-success",
  Reported: "border-border text-fg",
  Rumour: "border-dashed border-border text-muted",
  Fixture: "border-gold text-gold",
  Research: "border-border text-muted",
};

/**
 * Today's brief for one topic: real headlines from Google News (your trusted sources only,
 * when you've listed some), then, with your Gemini key, the most important few, labelled.
 * Without a key, or if the AI is busy, you get the newest headlines.
 */
export async function fetchBrief(key: string | undefined, topic: Area, day = today()): Promise<NewsSet> {
  const sources = store.get("newsSources")?.[topic.id] ?? [];
  const r = await fetch(`/api/news?${new URLSearchParams({ topic: topic.name, sources: sources.join(",") })}`);
  if (!r.ok) throw new Error(r.status === 429 ? "slow_down" : "unavailable");
  const all = withoutBlocked(((await r.json()).items ?? []) as Headline[], store.get("blocked") ?? []);
  let raw: unknown = null;
  if (key && all.length) { try { raw = await generateJson<unknown>(key, rankPrompt(topic.name, all)); } catch {} }
  const set: NewsSet = { topic: topic.id, day, items: toStories(raw, all, topic.id), at: Date.now() };
  await store.update("news", l => [...(l ?? []).filter(s => !(s.topic === topic.id && s.day === day)), set].slice(-60));
  return set;
}

/** The post's id when a story links to a single X post. */
export function xPostId(url: string): string | null {
  const m = /^https:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/[A-Za-z0-9_]{1,15}\/status\/(\d{5,25})/.exec(url);
  return m ? m[1] : null;
}

/**
 * Shows an X post inside Lumen: X's own embed in a frame, with tracking off and
 * no timeline, so you read the post without opening X or signing in.
 */
function XPost({ id }: { id: string }) {
  const [h, setH] = useState(420);
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.origin !== "https://platform.twitter.com" || e.source !== frame.current?.contentWindow) return;
      try {
        const d = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        const p = d?.["twttr.embed"];
        if (p?.method === "twttr.private.resize" && p.params?.[0]?.height) setH(Math.min(1200, Math.ceil(p.params[0].height)));
      } catch {}
    };
    window.addEventListener("message", on);
    return () => window.removeEventListener("message", on);
  }, []);
  const [dark] = useState(() => { const t = document.documentElement.dataset.theme; return t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches; });
  return <iframe ref={frame} title="Post on X" src={`https://platform.twitter.com/embed/Tweet.html?id=${id}&dnt=true&hideThread=true&theme=${dark ? "dark" : "light"}&lang=en`} style={{ height: h }} className="w-full max-w-[550px] rounded-[12px] border-0" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox" loading="lazy" />;
}

function Story({ n }: { n: NewsItem }) {
  const [show, setShow] = useState(false);
  const post = xPostId(n.url);
  return (
    <li className="flex flex-col gap-1 border-t border-border py-2.5 first:border-t-0 first:pt-0">
      <div className="flex items-center gap-2 text-[11.5px]">
        <span className={cn("rounded-full border px-2 py-px", STATUS_STYLE[n.status])}>{n.status}</span>
        <span className="truncate text-muted">{n.source}{n.date ? ` · ${new Date(n.date + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}</span>
      </div>
      <a href={n.url} target="_blank" rel="noopener noreferrer" className="font-medium leading-snug hover:underline hover:underline-offset-4">{n.title}</a>
      {n.summary && <p className="text-[13px] text-muted">{n.summary}</p>}
      {post && (show ? <XPost id={post} /> : <button onClick={() => setShow(true)} className="self-start text-[12.5px] underline underline-offset-4">Show the post</button>)}
    </li>
  );
}

/** Today's brief for each followed news topic: a few labelled stories from trusted sources, fetched once a day. */
export function NewsBrief({ topics }: { topics: Area[] }) {
  const s = useStore();
  const ai = s.get("ai");
  const day = today();
  const sets = s.get("news") ?? [];
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const has = (id: string) => sets.find(x => x.topic === id && x.day === day);
  const missing = topics.filter(t => !has(t.id));

  async function load() {
    setErr(null);
    for (const t of missing) {
      setBusy(t.name);
      try { await fetchBrief(ai?.mode === "own" ? ai.key : undefined, t, day); }
      catch (e) { setErr((e as Error).message === "slow_down" ? "Too many requests at once. Try again in a minute." : `Couldn't reach the news for ${t.name}. Check your connection and try again.`); break; }
    }
    setBusy(null);
  }

  return (
    <Card className="flex flex-col gap-3">
      {topics.map(t => {
        const set = has(t.id);
        if (!set) return null;
        return (
          <div key={t.id} className="flex flex-col gap-2">
            <p className="eyebrow">{t.name}</p>
            {set.items.length ? <ul className="flex flex-col">{set.items.map(n => <Story key={n.id} n={n} />)}</ul>
              : <p className="text-[13px] text-muted">No news from your trusted sources in the last two days.</p>}
            {ai?.mode !== "own" && set.items.length > 0 && <p className="text-[12px] text-muted">Newest headlines. With your Gemini key, Lumen picks the most important and labels them.</p>}
          </div>
        );
      })}
      {missing.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 first:border-t-0 first:pt-0">
          <p className="text-[13px] text-muted">{busy ? `Checking ${busy}…` : `Today's brief: ${missing.map(m => m.name).join(", ")}`}</p>
          <Button size="sm" variant="ghost" disabled={!!busy} onClick={load}>{busy ? "Reading the news…" : "Get today's brief"}</Button>
        </div>
      )}
      {err && <p role="alert" className="text-[13px] text-danger">{err}</p>}
    </Card>
  );
}

/** On You: which outlets and accounts each news topic may use. */
export function NewsSources({ topics }: { topics: Area[] }) {
  const s = useStore();
  const all = s.get("newsSources") ?? {};
  const [draft, setDraft] = useState<Record<string, string>>({});
  const save = (id: string, list: string[]) => store.set("newsSources", { ...all, [id]: list });
  return (
    <Card className="flex flex-col">
      <span className="eyebrow mb-1">News sources</span>
      <p className="mb-1 text-[13px] text-muted">Each brief uses only the websites you list, from Google News. Leave a topic empty for headlines from all outlets Google News covers. Add a website, e.g. manutd.com or bbc.co.uk.</p>
      {topics.map(t => {
        const list = all[t.id] ?? [];
        return (
          <div key={t.id} className="flex flex-col gap-2 border-t border-border py-2.5">
            <p className="font-medium">{t.name}</p>
            <div className="flex flex-wrap gap-1.5">
              {list.length === 0 && <span className="text-[12.5px] text-muted">Any trusted outlet</span>}
              {list.map(src => (
                <span key={src} className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-0.5 text-[12.5px]">{src}
                  <button aria-label={`Remove ${src}`} className="text-muted hover:text-danger" onClick={() => save(t.id, list.filter(x => x !== src))}>×</button></span>
              ))}
            </div>
            <form className="flex gap-2" onSubmit={e => {
              e.preventDefault();
              const v = (draft[t.id] ?? "").trim().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "").replace(/^twitter\.com/, "x.com");
              if (v && !list.includes(v)) save(t.id, [...list, v].slice(0, 20));
              setDraft(d => ({ ...d, [t.id]: "" }));
            }}>
              <label htmlFor={`src-${t.id}`} className="sr-only">Add a source for {t.name}</label>
              <input id={`src-${t.id}`} value={draft[t.id] ?? ""} onChange={e => setDraft(d => ({ ...d, [t.id]: e.target.value }))} placeholder="e.g. manutd.com" className="min-w-0 flex-1 rounded-[10px] border border-border bg-surface px-3 py-1.5 text-[14px]" />
              <Button variant="ghost" size="sm" type="submit">Add</Button>
            </form>
          </div>
        );
      })}
    </Card>
  );
}
