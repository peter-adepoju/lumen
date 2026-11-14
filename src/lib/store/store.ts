"use client";
// Lumen's store: reads and writes go to the device first (instant, offline),
// then sync to the user's Google Drive in the background.

import { useSyncExternalStore } from "react";
import type { DocName, Docs } from "../model";
import { idb } from "./idb";
import { Drive, DriveError } from "./drive";
import { isEnvelope, joinChoice, pick, wrap, type Envelope } from "./merge";

export type Mode = "google" | "device";
export type SyncState = "device" | "syncing" | "synced" | "offline" | "reconnect" | "error";

/** The account's own setup: when a new device joins, Drive's copy of these wins over the device's. */
const SETUP_DOCS = new Set<DocName>(["profile", "ai", "newsSources", "readerSettings"]);

const DOCS: DocName[] = ["profile", "ai", "blocked", "added", "picks", "feedback", "progress", "journal", "stats", "library", "reading", "readerSettings", "cards", "drills", "news", "newsSources", "unwind", "games", "saved", "activity", "interests"];
const file = (n: DocName) => `${n}.json`;

let token: { value: string; expiresAt: number } | null = null;
async function accessToken(): Promise<string> {
  if (token && token.expiresAt > Date.now() + 30_000) return token.value;
  const res = await fetch("/api/auth/token", { method: "POST" });
  if (res.status === 401) throw new DriveError(401, "signed_out");
  if (!res.ok) throw new DriveError(res.status, "token");
  const j = await res.json();
  token = { value: j.accessToken, expiresAt: j.expiresAt };
  return token.value;
}

class Store {
  private cache = new Map<DocName, Envelope>();
  private dirty = new Set<DocName>();
  private listeners = new Set<() => void>();
  private drive: Drive | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private ready: Promise<void> | null = null;
  mode: Mode = "device";
  state: SyncState = "device";
  loaded = false;
  private version = 0;

  init(): Promise<void> {
    if (!this.ready) this.ready = this.load();
    return this.ready;
  }

  private async load() {
    this.mode = ((await idb.get<Mode>("mode")) ?? "device") as Mode;
    for (const n of DOCS) {
      const e = await idb.get<Envelope>("doc:" + n);
      if (isEnvelope(e)) this.cache.set(n, e);
    }
    (await idb.get<DocName[]>("dirty") ?? []).forEach(n => this.dirty.add(n));
    this.loaded = true;
    this.emit();
    if (typeof window !== "undefined") window.addEventListener("online", () => this.sync());
    if (this.mode === "google") this.sync();
  }

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  snapshot = () => this.version;
  private emit() { this.version++; this.listeners.forEach(f => f()); }
  private setState(s: SyncState) { if (this.state !== s) { this.state = s; this.emit(); } }

  get<K extends DocName>(name: K): Docs[K] | undefined {
    return this.cache.get(name)?.v as Docs[K] | undefined;
  }

  async set<K extends DocName>(name: K, value: Docs[K]) {
    const e = wrap(value);
    this.cache.set(name, e);
    this.dirty.add(name);
    this.emit();
    await idb.set("doc:" + name, e);
    await idb.set("dirty", [...this.dirty]);
    if (this.mode === "google") this.schedule();
  }

  async update<K extends DocName>(name: K, fn: (cur: Docs[K] | undefined) => Docs[K]) {
    await this.set(name, fn(this.get(name)));
  }

  /** Switch to Google Drive (after sign-in) or back to this device only. */
  async useMode(mode: Mode) {
    this.mode = mode;
    await idb.set("mode", mode);
    // Joining Drive: compare with what's already there instead of overwriting it (see run()).
    if (mode === "google") { this.joining = true; await this.sync(); }
    else this.setState("device");
    this.emit();
  }

  private schedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.sync(), 1200);
  }

  private syncing: Promise<void> | null = null;
  /** True for the first sync after this device joins Drive. */
  private joining = false;
  sync(): Promise<void> {
    if (this.mode !== "google") return Promise.resolve();
    if (this.syncing) return this.syncing;
    this.syncing = this.run().finally(() => { this.syncing = null; });
    return this.syncing;
  }

  private async run() {
    if (typeof navigator !== "undefined" && !navigator.onLine) { this.setState("offline"); return; }
    this.setState("syncing");
    try {
      this.drive = this.drive ?? new Drive(accessToken);
      const joining = this.joining;
      for (const n of DOCS) {
        const remote = await this.drive.readJson<Envelope>(file(n));
        const r = isEnvelope(remote) ? remote : null, local = this.cache.get(n);
        if (joining) {
          // A device joining an account: the account's own setup in Drive wins; for everything
          // else the newer copy wins; anything only on this device is uploaded.
          const choice = joinChoice(SETUP_DOCS.has(n), local, r);
          if (choice === "take-remote" && r) { this.cache.set(n, r); this.dirty.delete(n); await idb.set("doc:" + n, r); this.emit(); }
          else if (choice === "upload") this.dirty.add(n);
          continue;
        }
        if (this.dirty.has(n)) continue; // our change is newer than anything we pulled before it
        if (pick(local, r) === "remote" && r) { this.cache.set(n, r); await idb.set("doc:" + n, r); this.emit(); }
      }
      this.joining = false;
      await idb.set("dirty", [...this.dirty]);
      for (const n of [...this.dirty]) {
        const e = this.cache.get(n);
        if (e) await this.drive.writeJson(file(n), e);
        this.dirty.delete(n);
        await idb.set("dirty", [...this.dirty]);
      }
      this.setState("synced");
    } catch (err) {
      if (err instanceof DriveError && err.status === 401) this.setState("reconnect");
      else this.setState(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "error");
    }
  }

  /** The user's Drive, when they're signed in with Google; null when Lumen is on this device only. */
  driveClient(): Drive | null {
    if (this.mode !== "google") return null;
    this.drive = this.drive ?? new Drive(accessToken);
    return this.drive;
  }

  /** Everything on this device, for "Export my data". */
  exportAll(): Record<string, unknown> {
    return Object.fromEntries(DOCS.map(n => [n, this.cache.get(n)?.v ?? null]));
  }

  async clearDevice() {
    await idb.clear();
    this.cache.clear(); this.dirty.clear(); this.mode = "device"; this.state = "device"; token = null; this.drive = null;
    this.emit();
  }
}

export const store = new Store();

/** Re-renders when any document or the sync state changes. */
export function useStore() {
  useSyncExternalStore(store.subscribe, store.snapshot, () => 0);
  return store;
}
