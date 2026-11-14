"use client";
import { useEffect, useRef, useState } from "react";
import type { Item, ItemKind, SavedLink } from "@/lib/model";
import { KIND_LABEL } from "@/lib/model";
import { classify } from "@/lib/links";
import { folders, fromShare, importSelahCsv, INBOX, makeSaved, matches, tagList, upsertSaved, type Checked } from "@/lib/saved";
import { logActivity } from "@/lib/activity";
import { store, useStore } from "@/lib/store/store";
import { Button, Card, cn, Pill } from "./ui";
import { Player } from "./player";
import { SourceIcon } from "./news";

async function check(url: string): Promise<Checked | null> {
  try {
    const r = await fetch("/api/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: [{ url }] }) });
    return r.ok ? ((await r.json()).items?.[0] ?? null) : null;
  } catch { return null; }
}

/** Saves a link (checked for its title and picture), and notes it for interest-spotting. */
export async function saveLink(url: string, extra: Partial<SavedLink> = {}): Promise<SavedLink | null> {
  const info = await check(url.trim());
  const s = makeSaved(url, info, extra);
  if (!s) return null;
  await store.update("saved", l => upsertSaved(l, s));
  logActivity("save", `${s.title}${s.creator ? ` (${s.creator}, ${s.platform})` : ` (${s.platform})`}${s.note ? ` — ${s.note.slice(0, 80)}` : ""}${s.tags.length ? ` #${s.tags.join(" #")}` : ""}`);
  return s;
}

const playable = (s: SavedLink) => { const c = classify(s.url); return !!(c?.youtubeId || c?.playlistId) || !!(s.embed && /^https:\/\/(www\.tiktok\.com\/player|player\.vimeo\.com|embed\.ted\.com)/.test(s.embed)) || (s.kind === "podcast" && !!s.embed && /\.(mp3|m4a|aac)(\?|$)/i.test(s.embed)); };
const asItem = (s: SavedLink): Item => ({ id: s.id, kind: s.kind, url: s.url, title: s.title, creator: s.creator ?? "", platform: s.platform, thumb: s.thumb, embed: s.embed, area: "saved" });
const KINDS: (ItemKind | "all")[] = ["all", "video", "clip", "playlist", "podcast", "article", "book", "course"];

function AddBox({ folder, onAdded, initial }: { folder: string; onAdded: () => void; initial?: { url: string; title?: string } | null }) {
  const [url, setUrl] = useState(initial?.url ?? "");
  const [note, setNote] = useState("");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const auto = useRef(false);
  async function add(e?: React.FormEvent) {
    e?.preventDefault();
    if (!classify(url.trim())) { setMsg("Paste a full link, starting with https://"); return; }
    setBusy(true); setMsg(null);
    const s = await saveLink(url, { folder, note: note.trim() || undefined, tags: tagList(tags), ...(initial?.title ? { title: initial.title } : {}), ...(initial ? { from: "share" as const } : {}) });
    setBusy(false);
    if (!s) { setMsg("That link couldn't be saved."); return; }
    setUrl(""); setNote(""); setTags(""); setMsg(`Saved “${s.title}”.`); onAdded();
  }
  // Shared from another app: save it straight away.
  useEffect(() => { if (initial?.url && !auto.current) { auto.current = true; void add(); } }, [initial?.url]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Card className="flex flex-col gap-2">
      <form onSubmit={add} className="flex flex-col gap-2">
        <div className="flex gap-2">
          <label htmlFor="save-url" className="sr-only">Link to save</label>
          <input id="save-url" value={url} onChange={e => { setUrl(e.target.value); setMsg(null); }} inputMode="url" placeholder="Paste a link: YouTube, TikTok, a podcast, an article…" className="min-w-0 flex-1 rounded-[10px] border border-border bg-surface px-3 py-2 text-[14px]" />
          <Button size="sm" type="submit" disabled={!url.trim() || busy}>{busy ? "Saving…" : "Save"}</Button>
        </div>
        {url.trim() && (
          <div className="flex flex-wrap gap-2">
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="A note (optional)" aria-label="Note" className="min-w-[160px] flex-1 rounded-[10px] border border-border bg-surface px-3 py-1.5 text-[13px]" />
            <input value={tags} onChange={e => setTags(e.target.value)} placeholder="Tags, comma-separated" aria-label="Tags" className="min-w-[140px] flex-1 rounded-[10px] border border-border bg-surface px-3 py-1.5 text-[13px]" />
          </div>
        )}
        {msg && <p className="text-[13px] text-muted" role="status">{msg}</p>}
      </form>
    </Card>
  );
}

function SavedRow({ s, all, startOpen }: { s: SavedLink; all: string[]; startOpen?: boolean }) {
  const [open, setOpen] = useState(!!startOpen);
  const row = useRef<HTMLLIElement>(null);
  useEffect(() => { if (startOpen) row.current?.scrollIntoView({ block: "start", behavior: "smooth" }); }, [startOpen]);
  const progress = useStore().get("progress")?.[s.id];
  const [edit, setEdit] = useState(false);
  const [note, setNote] = useState(s.note ?? "");
  const [tags, setTags] = useState(s.tags.join(", "));
  const [folder, setFolder] = useState(s.folder);
  const update = (p: Partial<SavedLink>) => store.update("saved", l => (l ?? []).map(x => (x.id === s.id ? { ...x, ...p } : x)));
  const canPlay = playable(s);
  const pic = s.thumb ?? (s.episodes?.length ? `https://i.ytimg.com/vi/${s.episodes[s.episodes.length - 1].id}/mqdefault.jpg` : undefined);
  return (
    <li ref={row} className="flex scroll-mt-4 flex-col gap-2 border-t border-border py-3 first:border-t-0 first:pt-0">
      {open && canPlay && (
        <div className="flex flex-col gap-1">
          <Player item={asItem(s)} />
          <button onClick={() => setOpen(false)} className="self-end text-[12.5px] text-muted underline underline-offset-4">Close</button>
        </div>
      )}
      <div className="flex gap-3">
        <button onClick={() => (canPlay ? setOpen(o => !o) : window.open(s.url, "_blank", "noopener"))} aria-label={canPlay ? `Play ${s.title}` : `Open ${s.title}`}
          className="relative h-[68px] w-[120px] shrink-0 overflow-hidden rounded-[10px] border border-border bg-surface-2">
          {pic
            ? <img src={pic} alt="" loading="lazy" className="h-full w-full object-cover" onError={e => { e.currentTarget.style.visibility = "hidden"; }} />
            : <span className="grid h-full place-items-center"><SourceIcon url={s.url} name={s.platform} size={22} /></span>}
          {canPlay && <span className="absolute inset-0 grid place-items-center"><span className="grid size-7 place-items-center rounded-full bg-black/60 text-white"><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M8 5v14l11-7z" /></svg></span></span>}
        </button>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <a href={s.url} target="_blank" rel="noopener noreferrer" className={cn("line-clamp-2 font-medium leading-snug hover:underline hover:underline-offset-4", s.done && "text-muted line-through")}>{s.title}</a>
          <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-muted">
            <SourceIcon url={s.url} name={s.platform} size={12} />
            <span className="truncate">{[s.creator, s.platform, KIND_LABEL[s.kind], s.folder !== INBOX ? s.folder : ""].filter(Boolean).join(" · ")}</span>
          </span>
          {(s.episodes?.length || s.newIds?.length) ? (
            <span className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
              {s.episodes?.length ? <span>{s.episodes.length} episodes{progress?.video ? ` · on episode ${Math.max(1, (s.newestFirst ? [...s.episodes].reverse() : s.episodes).findIndex(e => e.id === progress.video) + 1)}` : ""}</span> : null}
              {s.newIds?.length ? <span className="rounded-full bg-[var(--gold-soft)] px-2 py-px font-medium text-fg">{s.newIds.length} new</span> : null}
            </span>
          ) : null}
          {s.note && !edit && <p className="line-clamp-2 text-[13px] text-muted">{s.note}</p>}
          {s.tags.length > 0 && !edit && <p className="text-[12px] text-muted">{s.tags.map(t => `#${t}`).join(" ")}</p>}
        </div>
      </div>
      {edit ? (
        <div className="flex flex-col gap-2">
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder="Your note" className="rounded-[10px] border border-border bg-surface px-3 py-2 text-[13.5px]" />
          <div className="flex flex-wrap gap-2">
            <input value={tags} onChange={e => setTags(e.target.value)} placeholder="Tags" className="min-w-[140px] flex-1 rounded-[10px] border border-border bg-surface px-3 py-1.5 text-[13px]" />
            <input value={folder} onChange={e => setFolder(e.target.value)} list="saved-folders" placeholder="Folder" className="min-w-[140px] flex-1 rounded-[10px] border border-border bg-surface px-3 py-1.5 text-[13px]" />
            <datalist id="saved-folders">{all.map(f => <option key={f} value={f} />)}</datalist>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => { void update({ note: note.trim() || undefined, tags: tagList(tags), folder: folder.trim() || INBOX }); setEdit(false); }}>Save</Button>
            <Button size="sm" variant="ghost" onClick={() => setEdit(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted">
          <button onClick={() => { void update({ done: !s.done }); if (!s.done) logActivity("finish", `${s.title} (${s.platform})`); }} className="underline underline-offset-4 hover:text-fg">{s.done ? "Not done" : s.kind === "article" || s.kind === "book" ? "Mark read" : "Mark watched"}</button>
          <button onClick={() => setEdit(true)} className="underline underline-offset-4 hover:text-fg">Note, tags, folder</button>
          <button onClick={() => void store.update("saved", l => (l ?? []).filter(x => x.id !== s.id))} className="ml-auto hover:text-danger">Remove</button>
        </div>
      )}
    </li>
  );
}

/** Everything you saved: paste links, sort them into folders, watch or read them here. */
/** Started videos and playlists, to pick up where you stopped. */
function ContinueStrip({ list, onOpen }: { list: SavedLink[]; onOpen: (id: string) => void }) {
  const progress = useStore().get("progress") ?? {};
  const going = list.filter(s => { const p = progress[s.id]; return p && !p.done && !s.done && ((p.seconds ?? 0) > 10 || p.video); })
    .sort((a, b) => (progress[b.id]?.at ?? 0) - (progress[a.id]?.at ?? 0)).slice(0, 6);
  if (!going.length) return null;
  return (
    <div className="flex flex-col gap-2">
      <span className="eyebrow">Continue where you left off</span>
      <ul className="no-scrollbar -mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1">
        {going.map(s => {
          const p = progress[s.id];
          const ep = s.episodes ? (s.newestFirst ? [...s.episodes].reverse() : s.episodes).findIndex(e => e.id === p?.video) : -1;
          const pct = p?.duration ? Math.min(100, Math.round(((p.seconds ?? 0) / p.duration) * 100)) : 0;
          return (
            <li key={s.id} className="w-[180px] shrink-0">
              <button onClick={() => onOpen(s.id)} className="flex w-full flex-col gap-1 text-left">
                <span className="relative block aspect-video w-full overflow-hidden rounded-[10px] border border-border bg-surface-2">
                  {(s.thumb ?? (p?.video ? `https://i.ytimg.com/vi/${p.video}/mqdefault.jpg` : undefined)) && <img src={s.thumb ?? `https://i.ytimg.com/vi/${p!.video}/mqdefault.jpg`} alt="" loading="lazy" className="h-full w-full object-cover" onError={e => { e.currentTarget.style.visibility = "hidden"; }} />}
                  <span className="absolute inset-x-0 bottom-0 h-1 bg-black/30"><span className="block h-full bg-gold" style={{ width: `${pct}%` }} /></span>
                </span>
                <span className="line-clamp-2 text-[13px] font-medium leading-snug">{s.title}</span>
                <span className="text-[11.5px] text-muted">{ep >= 0 && s.episodes ? `Episode ${ep + 1} of ${s.episodes.length}` : pct ? `${pct}% watched` : "Started"}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function SavedView({ share, openId }: { share?: { title?: string | null; text?: string | null; url?: string | null }; openId?: string | null }) {
  const st = useStore();
  const list = st.get("saved") ?? [];
  const [folder, setFolder] = useState<string>("all");
  const [kind, setKind] = useState<ItemKind | "all">("all");
  const [q, setQ] = useState("");
  const [show, setShow] = useState<"todo" | "done" | "all">("todo");
  const [limit, setLimit] = useState(40);
  const [msg, setMsg] = useState<string | null>(null);
  const all = folders(list);
  const shared = share ? fromShare(share) : null;
  const [opened, setOpened] = useState<string | null>(openId ?? null);
  const openItem = (id: string) => { setFolder("all"); setKind("all"); setShow("all"); setQ(""); setOpened(id); };

  // A finished search counts as something you were looking for.
  useEffect(() => { if (q.trim().length < 3) return; const t = setTimeout(() => logActivity("search", q.trim()), 1500); return () => clearTimeout(t); }, [q]);

  const shown = list
    .filter(s => folder === "all" || s.folder === folder)
    .filter(s => kind === "all" || s.kind === kind)
    .filter(s => show === "all" || (show === "done") === !!s.done)
    .filter(s => !q.trim() || matches(s, q))
    .sort((a, b) => b.savedAt - a.savedAt);

  async function importFile(f: File) {
    try {
      const items = importSelahCsv(await f.text());
      await store.update("saved", l => items.reduce((acc, s) => upsertSaved(acc, s), l ?? []));
      items.slice(0, 60).forEach(s => logActivity("save", `${s.title} (${s.platform})${s.tags.length ? ` #${s.tags.join(" #")}` : ""}`));
      setMsg(`Brought in ${items.length} saved links from Selah.`);
    } catch (e) { setMsg((e as Error).message); }
  }

  return (
    <div className="flex flex-col gap-3">
      <AddBox folder={folder === "all" ? INBOX : folder} initial={shared} onAdded={() => setShow("todo")} />
      <ContinueStrip list={list} onOpen={openItem} />
      <div className="flex flex-col gap-2">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search your saved links" aria-label="Search saved" className="rounded-[10px] border border-border bg-surface px-3 py-2 text-[14px]" />
        <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
          <Pill className="shrink-0 whitespace-nowrap" on={folder === "all"} onClick={() => setFolder("all")}>All folders</Pill>
          {all.map(f => <Pill key={f} className="shrink-0 whitespace-nowrap" on={folder === f} onClick={() => setFolder(f)}>{f}</Pill>)}
        </div>
        <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
          {KINDS.map(k => <Pill key={k} className="shrink-0 whitespace-nowrap" on={kind === k} onClick={() => setKind(k)}>{k === "all" ? "Every kind" : KIND_LABEL[k]}</Pill>)}
          <span className="mx-1 w-px shrink-0 bg-border" />
          {(["todo", "done", "all"] as const).map(v => <Pill key={v} className="shrink-0 whitespace-nowrap" on={show === v} onClick={() => setShow(v)}>{v === "todo" ? "To watch or read" : v === "done" ? "Done" : "Everything"}</Pill>)}
        </div>
      </div>
      <Card>
        {shown.length ? <ul className="flex flex-col">{shown.slice(0, opened ? Math.max(limit, shown.findIndex(x => x.id === opened) + 1) : limit).map(s => <SavedRow key={s.id + (opened === s.id ? ":open" : "")} s={s} all={all} startOpen={opened === s.id} />)}</ul>
          : <p className="text-[13.5px] text-muted">{list.length ? "Nothing here with these filters." : "Nothing saved yet. Paste a link above, or share a page to Lumen from your phone."}</p>}
        {shown.length > limit && <button onClick={() => setLimit(n => n + 60)} className="mt-2 text-[13px] underline underline-offset-4">Show more</button>}
      </Card>
      <Card className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13px] text-muted">From Selah: Export → Saved → spreadsheet (CSV), then bring the file in here.</span>
        <label className="cursor-pointer rounded-full border border-border px-3 py-1 text-[12.5px] font-medium hover:bg-surface-2">
          Import from Selah
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ""; }} />
        </label>
        {msg && <p className="w-full text-[13px] text-muted" role="status">{msg}</p>}
      </Card>
    </div>
  );
}
