"use client";
import { useEffect } from "react";
import { nextAt } from "@/lib/reminders";
import { today } from "@/lib/recs";
import { store } from "@/lib/store/store";

/** Registers the offline service worker (production only, so development always shows fresh code). */
export function useServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
  }, []);
}

/**
 * While Lumen is open (in a tab or installed), shows a notification at the
 * reminder time if today's session isn't done. The calendar event covers the
 * times Lumen is closed.
 */
export function useReminder() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const plan = () => {
      clearTimeout(timer);
      const r = store.get("profile")?.reminder;
      if (!r?.on || typeof Notification === "undefined" || Notification.permission !== "granted") return;
      const at = nextAt(r.time, new Date());
      timer = setTimeout(async () => {
        if (store.get("stats")?.lastDay !== today()) {
          const reg = await navigator.serviceWorker?.getRegistration();
          const opts = { body: "A few minutes today keeps your light going.", icon: "/icon-192.png", badge: "/icon-192.png", tag: "lumen-daily" };
          if (reg) await reg.showNotification("Time for Lumen", opts); else new Notification("Time for Lumen", opts);
        }
        plan();
      }, Math.min(at.getTime() - Date.now(), 2 ** 31 - 1));
    };
    plan();
    const off = store.subscribe(plan);
    return () => { clearTimeout(timer); off(); };
  }, []);
}
