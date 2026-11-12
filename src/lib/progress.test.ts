import { describe, expect, it } from "vitest";
import { areaActivity, areaLevel, drillTrend, heatmap, tastes } from "./progress";
import type { Feedback, SessionRecord } from "./model";

const sess = (day: string, area = "a", minutes = 20): SessionRecord => ({ day, area, steps: [], minutes, lumens: 70, at: Date.parse(day) });

describe("progress", () => {
  it("builds a Monday-first heatmap ending this week", () => {
    const g = heatmap([sess("2026-11-12"), sess("2026-11-12", "b", 10), sess("2026-11-09")], "2026-11-12", 2);
    expect(g).toHaveLength(2);
    expect(g[1][0].day).toBe("2026-11-09"); // Monday
    expect(g[0][0].day).toBe("2026-11-02");
    expect(g[1][3]).toMatchObject({ day: "2026-11-12", minutes: 30, sessions: 2, future: false });
    expect(g[1][4].future).toBe(true);
  });
  it("ranks areas by sessions", () => {
    const a = areaActivity([sess("2026-11-01", "x"), sess("2026-11-02", "y"), sess("2026-11-03", "y")]);
    expect(a.map(x => x.area)).toEqual(["y", "x"]);
    expect(a[0]).toMatchObject({ sessions: 2, minutes: 40, last: "2026-11-03" });
  });
  it("levels areas every five sessions", () => {
    expect(areaLevel(0)).toEqual({ level: 1, pct: 0 });
    expect(areaLevel(7)).toEqual({ level: 2, pct: 40 });
    expect(areaLevel(99).level).toBe(10);
  });
  it("orders drill scores", () => {
    const t = drillTrend([{ kind: "digit-span", score: 6, day: "d", at: 2 }, { kind: "digit-span", score: 5, day: "d", at: 1 }, { kind: "quiz", score: 3, day: "d", at: 3 }], "digit-span");
    expect(t.map(x => x.score)).toEqual([5, 6]);
  });
  it("finds liked and disliked creators", () => {
    const f = (creator: string, rating: Feedback["rating"]): Feedback => ({ id: creator + rating, title: "t", creator, platform: "YouTube", area: "a", rating, at: 1 });
    const t = tastes([f("Ali", "up"), f("Ali", "done"), f("Bo", "up"), f("Cy", "down")]);
    expect(t.liked).toEqual([{ name: "Ali", n: 2 }, { name: "Bo", n: 1 }]);
    expect(t.disliked).toEqual([{ name: "Cy", n: 1 }]);
  });
});
