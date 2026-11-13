// Each saved document carries the time it was last changed. When the copy on
// this device and the copy in Drive differ, the newer one wins.

export interface Envelope<T = unknown> { v: T; at: number }

export function wrap<T>(v: T, at = Date.now()): Envelope<T> {
  return { v, at };
}

/** Returns which copy to keep. On a tie the device copy stays, so nothing is re-uploaded for no reason. */
export function pick<T>(local: Envelope<T> | null | undefined, remote: Envelope<T> | null | undefined): "local" | "remote" | "none" {
  if (!local && !remote) return "none";
  if (!remote) return "local";
  if (!local) return "remote";
  return remote.at > local.at ? "remote" : "local";
}

export function isEnvelope(x: unknown): x is Envelope {
  return !!x && typeof x === "object" && "at" in x && "v" in x && typeof (x as Envelope).at === "number";
}

/**
 * When a device first joins an account's Drive: the account's own setup (areas, AI key,
 * news sources, reader settings) comes from Drive if it's there; for everything else the
 * newer copy wins; anything only on the device is uploaded. Returns what to do with one document.
 */
export function joinChoice<T>(isSetup: boolean, local: Envelope<T> | null | undefined, remote: Envelope<T> | null | undefined): "take-remote" | "upload" | "keep" {
  const which = remote && isSetup ? "remote" : pick(local, remote);
  if (which === "remote" && remote) return "take-remote";
  if (local && (!remote || remote.at !== local.at)) return "upload";
  return "keep";
}
