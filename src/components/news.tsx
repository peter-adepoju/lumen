"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Area, Item, NewsItem, NewsSet, NewsStatus, NewsVideo } from "@/lib/model";
import { channelPrompt, defaultChannels, faviconFor, isVideoSource, markFresh, normaliseVideoSource, rankPrompt, relevantVideos, toStories, withoutBlocked, type Headline } from "@/lib/news";
import { itemId } from "@/lib/links";
import { Player } from "./player";
import { generateJson } from "@/lib/gemini";
import { today } from "@/lib/recs";
import { store, useStore } from "@/lib/store/store";
import { Button, Card, cn } from "./ui";

const PREVIEW = 3; // stories per topic on Today

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
  const allSources = store.get("newsSources")?.[topic.id] ?? [];
  const sources = allSources.filter(x => !isVideoSource(x));
  const blocked = store.get("blocked") ?? [];
  const [r, vids] = await Promise.all([
    fetch(`/api/news?${new URLSearchParams({ topic: topic.name, sources: sources.join(",") })}`),
    fetchVideos(key, topic, allSources.filter(isVideoSource)).catch(() => null),
  ]);
  if (!r.ok) throw new Error(r.status === 429 ? "slow_down" : "unavailable");
  const all = withoutBlocked(((await r.json()).items ?? []) as Headline[], blocked);
  let raw: unknown = null;
  if (key && all.length) { try { raw = await generateJson<unknown>(key, rankPrompt(topic.name, all, 10)); } catch {} }
  const before = store.get("news")?.find(s => s.topic === topic.id && s.day === day);
  const set: NewsSet = {
    topic: topic.id, day, items: markFresh(toStories(raw, all, topic.id, 10), before?.items), at: Date.now(),
    ...(vids ? { videos: relevantVideos(vids.videos, topic.name, blocked), videoChannels: vids.channels } : before?.videos ? { videos: before.videos, videoChannels: before.videoChannels } : {}),
  };
  await store.update("news", l => [...(l ?? []).filter(s => !(s.topic === topic.id && s.day === day)), set].slice(-60));
  return set;
}

/**
 * Videos for a topic: from the YouTube channels you listed for it; otherwise from channels suggested
 * for the topic (by your AI, once, then remembered), or a few established outlets to start from.
 */
async function fetchVideos(key: string | undefined, topic: Area, mine: string[]): Promise<{ videos: (NewsVideo & { channel: string })[]; channels: string[] }> {
  let channels = mine;
  if (!channels.length) {
    const earlier = [...(store.get("news") ?? [])].reverse().find(s => s.topic === topic.id && s.videoChannels?.length)?.videoChannels;
    if (earlier) channels = earlier;
    else if (key) {
      try {
        const raw = await generateJson<unknown>(key, channelPrompt(topic.name));
        channels = (Array.isArray(raw) ? raw : []).map(x => normaliseVideoSource(String(x))).filter((x): x is string => !!x).slice(0, 4);
      } catch {}
    }
    if (!channels.length) channels = defaultChannels(topic.name);
  }
  const r = await fetch(`/api/news/videos?${new URLSearchParams({ channels: channels.join(",") })}`);
  if (!r.ok) throw new Error("videos " + r.status);
  const j = (await r.json()) as { videos?: (NewsVideo & { channel: string })[]; unknown?: string[] };
  // Channels YouTube doesn't know (a mistyped or made-up handle) aren't tried again.
  const known = channels.filter(c => !(j.unknown ?? []).includes(c));
  return { videos: j.videos ?? [], channels: mine.length ? mine : known.length ? known : defaultChannels(topic.name) };
}

/** The outlet's own little icon, or its first letter when there isn't one. */
export function SourceIcon({ url, name, size = 14 }: { url?: string; name: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  const src = faviconFor(url);
  if (!src || broken) return <span aria-hidden className="inline-grid shrink-0 place-items-center rounded-[4px] bg-surface-2 text-[9px] font-semibold uppercase text-muted" style={{ width: size, height: size }}>{name.trim()[0] ?? "·"}</span>;
  return <img src={src} alt="" width={size} height={size} loading="lazy" onError={() => setBroken(true)} className="shrink-0 rounded-[3px]" style={{ width: size, height: size }} />;
}

/** A row of news videos; tapping one plays it here (no related videos, and Lumen remembers where you stopped). */
function Videos({ videos, topic, compact }: { videos: NewsVideo[]; topic: string; compact?: boolean }) {
  const [playing, setPlaying] = useState<string | null>(null);
  const list = compact ? videos.slice(0, 4) : videos;
  const current = list.find(v => v.id === playing);
  const asItem = (v: NewsVideo): Item => ({ id: itemId(v.url), kind: "video", url: v.url, title: v.title, creator: v.channel, platform: "YouTube", thumb: v.thumb, area: topic });
  if (!list.length) return null;
  return (
    <div className="flex flex-col gap-2">
      {current && (
        <div className="flex flex-col gap-1.5">
          <Player key={current.id} item={asItem(current)} />
          <div className="flex items-center gap-2 text-[12.5px] text-muted">
            <SourceIcon url="https://www.youtube.com" name="YouTube" /> <span className="truncate">{current.channel}</span>
            <button onClick={() => setPlaying(null)} className="ml-auto underline underline-offset-4">Close video</button>
          </div>
        </div>
      )}
      <ul className="no-scrollbar -mx-1 flex snap-x gap-2.5 overflow-x-auto px-1 pb-1">
        {list.map(v => (
          <li key={v.id} className="w-[200px] shrink-0 snap-start">
            <button onClick={() => setPlaying(v.id)} aria-label={`Play: ${v.title}`} className={cn("group flex w-full flex-col gap-1.5 text-left", playing === v.id && "opacity-60")}>
              <span className="relative block aspect-video w-full overflow-hidden rounded-[10px] border border-border bg-surface-2">
                <img src={v.thumb} alt="" loading="lazy" className="h-full w-full object-cover" onError={e => { e.currentTarget.style.visibility = "hidden"; }} />
                <span className="absolute inset-0 grid place-items-center">
                  <span className="grid size-9 place-items-center rounded-full bg-black/60 text-white transition-transform group-hover:scale-105">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M8 5v14l11-7z" /></svg>
                  </span>
                </span>
              </span>
              <span className="line-clamp-2 text-[13px] font-medium leading-snug">{v.title}</span>
              <span className="flex items-center gap-1.5 text-[11.5px] text-muted">
                <SourceIcon url="https://www.youtube.com" name="YouTube" size={12} />
                <span className="truncate">{v.channel} · {new Date(v.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
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
        {n.fresh && <span className="rounded-full bg-[var(--gold-soft)] px-2 py-px font-medium text-fg">New</span>}
        <SourceIcon url={n.sourceUrl} name={n.source} />
        <span className="truncate text-muted">{n.source}{n.date ? ` · ${new Date(n.date + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}</span>
      </div>
      <a href={n.url} target="_blank" rel="noopener noreferrer" className="font-medium leading-snug hover:underline hover:underline-offset-4">{n.title}</a>
      {n.summary && <p className="text-[13px] text-muted">{n.summary}</p>}
      {post && (show ? <XPost id={post} /> : <button onClick={() => setShow(true)} className="self-start text-[12.5px] underline underline-offset-4">Show the post</button>)}
    </li>
  );
}

/** Today's brief for each followed news topic: a few labelled stories from trusted sources, fetched once a day. */
/** The news brief. `compact` (on Today) shows the top few stories per topic with "See all"; the News page shows everything. */
export function NewsBrief({ topics, compact = false }: { topics: Area[]; compact?: boolean }) {
  const s = useStore();
  const ai = s.get("ai");
  const day = today();
  const sets = s.get("news") ?? [];
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const has = (id: string) => sets.find(x => x.topic === id && x.day === day);
  const missing = topics.filter(t => !has(t.id));

  const loaded = topics.map(t => has(t.id)).filter((x): x is NewsSet => !!x);
  const total = loaded.reduce((n, x) => n + x.items.length, 0), shown = loaded.reduce((n, x) => n + Math.min(PREVIEW, x.items.length), 0);
  const updated = loaded.length ? Math.min(...loaded.map(x => x.at)) : null;
  const time = (t: number) => new Date(t).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" });

  async function load(list: Area[] = missing) {
    setErr(null);
    for (const t of list) {
      setBusy(t.name);
      try { await fetchBrief(ai?.mode === "own" ? ai.key : undefined, t, day); }
      catch (e) { setErr((e as Error).message === "slow_down" ? "Too many requests at once. Try again in a minute." : `Couldn't reach the news for ${t.name}. Check your connection and try again.`); break; }
    }
    setBusy(null);
  }

  return (
    <Card className="flex flex-col gap-3">
      {loaded.length > 0 && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-[12px] text-muted" role="status">{busy ? `Updating ${busy}…` : `Updated ${time(updated!)}`}</p>
          <button onClick={() => void load(topics)} disabled={!!busy} aria-label="Refresh the news"
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-[12.5px] font-medium hover:bg-surface-2 disabled:opacity-50">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={busy ? "animate-spin" : ""}><path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v4h-4" /></svg>
            {busy ? "Refreshing" : "Refresh"}
          </button>
        </div>
      )}
      {topics.map(t => {
        const set = has(t.id);
        if (!set) return null;
        return (
          <div key={t.id} className="flex flex-col gap-2 border-t border-border pt-3 first:border-t-0 first:pt-0">
            <p className="eyebrow">{t.name}</p>
            {set.items.length ? <ul className="flex flex-col">{(compact ? set.items.slice(0, PREVIEW) : set.items).map(n => <Story key={n.id} n={n} />)}</ul>
              : <p className="text-[13px] text-muted">No news from your trusted sources in the last two days.</p>}
            {!!set.videos?.length && (
              <div className="flex flex-col gap-2 pt-1">
                <p className="text-[12px] font-medium text-muted">Watch</p>
                <Videos videos={set.videos} topic={t.id} compact={compact} />
              </div>
            )}
            {ai?.mode !== "own" && set.items.length > 0 && <p className="text-[12px] text-muted">Newest headlines. With your Gemini key, Lumen picks the most important and labels them.</p>}
          </div>
        );
      })}
      {missing.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 first:border-t-0 first:pt-0">
          <p className="text-[13px] text-muted">{busy ? `Checking ${busy}…` : `Today's brief: ${missing.map(m => m.name).join(", ")}`}</p>
          <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => void load()}>{busy ? "Reading the news…" : "Get today's brief"}</Button>
        </div>
      )}
      {err && <p role="alert" className="text-[13px] text-danger">{err}</p>}
      {compact && total > shown && (
        <Link href="/news" className="self-start text-[13px] underline underline-offset-4">See all {total} stories</Link>
      )}
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
      <p className="mb-1 text-[13px] text-muted">Each brief uses only the websites you list, from Google News. Leave a topic empty for headlines from all outlets Google News covers. Add a website, e.g. manutd.com or bbc.co.uk, or a YouTube channel for videos, e.g. youtube.com/@SkySportsNews. Without your own channels, Lumen picks official ones for the topic.</p>
      {topics.map(t => {
        const list = all[t.id] ?? [];
        return (
          <div key={t.id} className="flex flex-col gap-2 border-t border-border py-2.5">
            <p className="font-medium">{t.name}</p>
            <div className="flex flex-wrap gap-1.5">
              {list.length === 0 && <span className="text-[12.5px] text-muted">Any trusted outlet</span>}
              {list.map(src => (
                <span key={src} className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-0.5 text-[12.5px]"><SourceIcon url={isVideoSource(src) ? "https://www.youtube.com" : src} name={src} size={12} />{isVideoSource(src) ? src.replace(/^youtube\.com\//, "") + " (YouTube)" : src}
                  <button aria-label={`Remove ${src}`} className="text-muted hover:text-danger" onClick={() => save(t.id, list.filter(x => x !== src))}>×</button></span>
              ))}
            </div>
            <form className="flex gap-2" onSubmit={e => {
              e.preventDefault();
              const typed = (draft[t.id] ?? "").trim();
              const v = normaliseVideoSource(typed) ?? typed.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "").replace(/^twitter\.com/, "x.com");
              if (v && !list.includes(v)) save(t.id, [...list, v].slice(0, 20));
              setDraft(d => ({ ...d, [t.id]: "" }));
            }}>
              <label htmlFor={`src-${t.id}`} className="sr-only">Add a source for {t.name}</label>
              <input id={`src-${t.id}`} value={draft[t.id] ?? ""} onChange={e => setDraft(d => ({ ...d, [t.id]: e.target.value }))} placeholder="manutd.com or youtube.com/@SkySportsNews" className="min-w-0 flex-1 rounded-[10px] border border-border bg-surface px-3 py-1.5 text-[14px]" />
              <Button variant="ghost" size="sm" type="submit">Add</Button>
            </form>
          </div>
        );
      })}
    </Card>
  );
}
