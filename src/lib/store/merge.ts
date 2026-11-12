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
