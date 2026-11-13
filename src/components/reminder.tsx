"use client";
import { useState } from "react";
import type { Profile } from "@/lib/model";
import { dailyIcs, googleCalendarUrl } from "@/lib/reminders";
import { store } from "@/lib/store/store";
import { Button, Card, Switch } from "./ui";
import { InstallButton, installHelp, useInstall } from "./install";

function download(name: string, text: string, type: string) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** On You: a daily reminder by calendar (always works) and by notification (while Lumen is open or installed). */
export function ReminderCard({ p }: { p: Profile }) {
  const r = p.reminder ?? { on: false, time: "19:00" };
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">(() => (typeof Notification === "undefined" ? "unsupported" : Notification.permission));
  const save = (patch: Partial<typeof r>) => store.set("profile", { ...p, reminder: { ...r, ...patch } });
  const url = typeof location === "undefined" ? "" : location.origin + "/today";

  async function toggle(on: boolean) {
    if (on && perm === "default") setPerm(await Notification.requestPermission());
    await save({ on });
  }
  return (
    <Card className="flex flex-col gap-2">
      <span className="eyebrow mb-1">Reminder</span>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor="rem-time">Daily at</label>
        <input id="rem-time" type="time" value={r.time} onChange={e => e.target.value && save({ time: e.target.value })} className="rounded-[8px] border border-border bg-surface-2 px-2 py-1 text-[14px]" />
      </div>
      <div className="flex flex-col gap-2 border-t border-border pt-2.5">
        <p className="text-[13px] text-muted">Add it to your calendar. This reminds you even when Lumen is closed.</p>
        <div className="flex flex-wrap gap-2">
          <a href={googleCalendarUrl(r.time, p.minutes, url, new Date())} target="_blank" rel="noopener noreferrer" className="rounded-full border border-border px-3 py-1 text-[13px] font-medium hover:bg-surface-2">Google Calendar</a>
          <Button size="sm" variant="ghost" onClick={() => download("lumen-daily.ics", dailyIcs(r.time, p.minutes, url, new Date()), "text/calendar")}>Apple or Outlook (.ics)</Button>
        </div>
      </div>
      <div className="flex items-center gap-3 border-t border-border pt-2.5">
        <div className="min-w-0 flex-1">
          <label htmlFor="rem-on" className="font-medium">Notification</label>
          <p className="text-[12.5px] text-muted">
            {perm === "unsupported" ? "This browser can't show notifications. On iPhone, add Lumen to your Home Screen first."
              : perm === "denied" ? "Notifications are blocked for Lumen in your browser settings."
              : "Shows at that time if you haven't done today's session, while Lumen is open or installed."}
          </p>
        </div>
        <Switch id="rem-on" label="Notification" checked={r.on && perm === "granted"} onChange={toggle} />
      </div>
    </Card>
  );
}

/** On You: install Lumen as an app on this phone or computer, and that it works offline. */
export function InstallCard() {
  const state = useInstall();
  const [ua] = useState(() => (typeof navigator === "undefined" ? "" : navigator.userAgent));
  return (
    <Card className="flex flex-col gap-2">
      <span className="eyebrow mb-1">App</span>
      {state === "installed" ? <p className="text-[14px]">Lumen is installed on this device.</p> : (
        <>
          <p className="text-[14px]">Install Lumen on this {/Mobi|Android|iPhone|iPad/.test(ua) ? "phone" : "computer"}: it opens in its own window from your {/Mobi|Android|iPhone|iPad/.test(ua) ? "home screen" : "taskbar, Start menu or Dock"}, like any app.</p>
          {state === "ready" ? <InstallButton className="self-start" /> : <p className="text-[13px] text-muted">{installHelp(ua)}</p>}
        </>
      )}
      <p className="text-[12.5px] text-muted">Lumen works offline once you&apos;ve opened it: your plan, library, flashcards, games and notes. AI picks, news and new links need a connection, and changes sync to your Drive when you&apos;re back online.</p>
    </Card>
  );
}
