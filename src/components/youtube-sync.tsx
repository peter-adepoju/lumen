"use client";
import { useState } from "react";
import { connectYouTubeUrl, getAccessToken, googleSignInUrl, useMe } from "@/lib/auth-client";
import { logActivity } from "@/lib/activity";
import { newLikes, syncYouTube } from "@/lib/youtube";
import { store, useStore } from "@/lib/store/store";
import { Button, Card } from "@/components/ui";

const when = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** Connect YouTube to bring your subscriptions and liked videos into Lumen. */
export function YouTubeCard() {
  const s = useStore();
  const me = useMe();
  const yt = s.get("youtube");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function sync() {
    setBusy(true); setMsg("");
    try {
      const token = await getAccessToken();
      if (!token) { setMsg("Please connect Google again."); return; }
      const prev = store.get("youtube");
      const next = await syncYouTube(token, prev);
      await store.set("youtube", next);
      // Let Lumen notice interests from what you like, without flooding the log.
      for (const v of newLikes(prev, next).slice(0, 25)) logActivity("like", `${v.title} (${v.channel})`);
      setMsg(`Brought in ${next.subs.length} subscription${next.subs.length === 1 ? "" : "s"} and ${next.likes.length} liked video${next.likes.length === 1 ? "" : "s"}.`);
    } catch {
      setMsg("Couldn't reach YouTube just now. Try again in a moment.");
    } finally { setBusy(false); }
  }

  return (
    <Card className="flex flex-col gap-2.5">
      <span className="eyebrow">YouTube</span>
      <p className="text-[13px] text-muted">Bring in the channels you subscribe to and the videos you like, so Lumen understands your interests better. Watch history isn&apos;t included — YouTube doesn&apos;t share it with any app.</p>

      {s.mode !== "google" ? (
        me?.googleConfigured
          ? <a href={googleSignInUrl("/you")} className="self-start rounded-full border border-border px-3 py-1 text-[13px] font-medium hover:bg-surface-2">Connect Google first</a>
          : <p className="text-[12.5px] text-muted">Google sign-in isn&apos;t set up on this copy of Lumen.</p>
      ) : !me?.youtube ? (
        <a href={connectYouTubeUrl("/you")} className="self-start rounded-full bg-fg px-4 py-1.5 text-[13px] font-medium text-bg hover:opacity-90">Connect YouTube</a>
      ) : (
        <>
          <div className="flex items-baseline gap-4 py-1">
            <span><span className="tabular font-display text-[26px]">{yt?.subs.length ?? 0}</span> <span className="text-[12.5px] text-muted">subscriptions</span></span>
            <span><span className="tabular font-display text-[26px]">{yt?.likes.length ?? 0}</span> <span className="text-[12.5px] text-muted">liked videos</span></span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" onClick={sync} disabled={busy}>{busy ? "Syncing…" : yt ? "Sync now" : "Bring them in"}</Button>
            {yt && <button className="text-[12.5px] text-muted underline underline-offset-4" onClick={() => store.set("youtube", { connectedAt: yt.connectedAt, syncedAt: 0, subs: [], likes: [] })}>Clear</button>}
            {yt?.syncedAt ? <span className="text-[12px] text-muted">Last synced {when(yt.syncedAt)}</span> : null}
          </div>
        </>
      )}
      {msg && <p className="text-[12.5px] text-muted">{msg}</p>}
    </Card>
  );
}
