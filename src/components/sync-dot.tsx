"use client";
import { useStore } from "@/lib/store/store";

const LABEL = {
  device: "Saved on this device",
  syncing: "Saving to your Drive…",
  synced: "Saved to your Drive",
  offline: "Offline. Changes will sync when you're back",
  reconnect: "Reconnect Google to keep syncing",
  error: "Couldn't reach Drive. Lumen will retry",
} as const;
const COLOR = { device: "bg-muted", syncing: "bg-gold", synced: "bg-success", offline: "bg-muted", reconnect: "bg-danger", error: "bg-danger" } as const;

export function SyncDot({ showLabel = false }: { showLabel?: boolean }) {
  const s = useStore();
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-muted" title={LABEL[s.state]} role="status">
      <span className={`size-2 rounded-full ${COLOR[s.state]}`} aria-hidden />
      <span className={showLabel ? "" : "sr-only"}>{LABEL[s.state]}</span>
    </span>
  );
}
