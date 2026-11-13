import { describe, expect, it } from "vitest";
import { light } from "./light";
import type { SessionRecord } from "./model";

const s = (day: string): SessionRecord => ({ day, area: "a", steps: [], minutes: 20, lumens: 70, at: 0 });
const T = "2026-11-13";
const docs = (days: string[]) => ({ stats: { streak: 0, best: 0, lastDay: null, lumens: 0, sessions: days.map(s) } });

describe("the light", () => {
  it("starts neutral for someone new", () => expect(light({}, T)).toMatchObject({ state: "new", level: 0.55 }));
  it("shines fully after a full week ending today", () => {
    const week = ["07", "08", "09", "10", "11", "12", "13"].map(d => `2026-11-${d}`);
    expect(light(docs(week), T)).toMatchObject({ state: "shining", level: 1, week: 7 });
  });
  it("is lit, not shining, with practice but no session today", () => {
    const l = light({ ...docs(["2026-11-12"]), drills: [{ kind: "digit-span", score: 5, day: T, at: 0 }] }, T);
    expect(l.state).toBe("lit"); expect(l.level).toBeLessThan(1);
  });
  it("waits, then dims day by day, then becomes an ember that never goes out", () => {
    const at = (today: string) => light(docs(["2026-11-01"]), today);
    const seq = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-07", "2026-11-12"].map(at);
    expect(seq.map(x => x.state)).toEqual(["waiting", "dimming", "dimming", "dimming", "dimming", "ember"]);
    for (let i = 1; i < seq.length; i++) expect(seq[i].level).toBeLessThanOrEqual(seq[i - 1].level);
    expect(seq.at(-1)!.level).toBeGreaterThanOrEqual(0.1);
    expect(at("2026-11-03")).toMatchObject({ missed: 1 });
  });
  it("relights with one session", () => {
    expect(light(docs(["2026-10-01", T]), T).state).toBe("shining");
  });
  it("is stronger with more learning days this week", () => {
    const few = light(docs(["2026-11-12"]), T), many = light(docs(["2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12"]), T);
    expect(many.level).toBeGreaterThan(few.level);
  });
});
