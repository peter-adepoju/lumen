import { describe, expect, it } from "vitest";
import { bumpPlay, topWatched } from "./watch";
import type { Item, WatchStat } from "./model";

const item = (id: string): Item => ({ id, kind: "video", url: `https://y/${id}`, title: `Video ${id}`, creator: "A", platform: "YouTube", area: "focus" });

describe("watch", () => {
  it("counts plays and keeps watched seconds", () => {
    const first = bumpPlay(undefined, item("a"));
    expect(first).toMatchObject({ id: "a", plays: 1, seconds: 0, title: "Video a" });
    const second = bumpPlay({ ...first, seconds: 40 }, item("a"));
    expect(second.plays).toBe(2);
    expect(second.seconds).toBe(40); // a new play doesn't reset watched time
  });

  it("ranks by seconds watched, then plays", () => {
    const w: Record<string, WatchStat> = {
      a: { ...bumpPlay(undefined, item("a")), seconds: 100, plays: 1 },
      b: { ...bumpPlay(undefined, item("b")), seconds: 300, plays: 1 },
      c: { ...bumpPlay(undefined, item("c")), seconds: 300, plays: 5 },
    };
    const top = topWatched(w, 2).map(x => x.id);
    expect(top).toEqual(["c", "b"]); // b and c tie on seconds; c wins on plays
  });

  it("is empty when nothing is watched", () => {
    expect(topWatched(undefined)).toEqual([]);
  });
});
