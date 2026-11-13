import { describe, expect, it } from "vitest";
import { combine, numberRound, pairsBoard, CAPITALS } from "./games";
import { dailyIcs, googleCalendarUrl, nextAt } from "./reminders";
import { reviewEntry, weekSummary } from "./review";
import { cleanNews, newsPrompt } from "./practice-ai";
import { newCard } from "./practice";
import type { SessionRecord } from "./model";

const seq = (vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };

describe("games", () => {
  it("only allows whole, positive results", () => {
    expect(combine(8, 3, "−")).toBe(5); expect(combine(3, 8, "−")).toBeNull();
    expect(combine(9, 3, "÷")).toBe(3); expect(combine(9, 2, "÷")).toBeNull(); expect(combine(7, 6, "×")).toBe(42);
  });
  it("makes reachable number rounds", () => {
    for (let k = 0; k < 50; k++) {
      const r = numberRound();
      expect(r.numbers).toHaveLength(6);
      expect(r.target).toBeGreaterThanOrEqual(101); expect(r.target).toBeLessThanOrEqual(999);
    }
  });
  it("builds pairs from flashcards, or capitals when there are too few", () => {
    const cards = ["a", "b", "c", "d", "e", "f"].map(x => newCard({ id: x, area: "fr", front: x + "1", back: x + "2\nexample" }, "2026-11-13"));
    const b = pairsBoard(cards, 6, seq([0.3, 0.7, 0.1]));
    expect(b.from).toBe("cards"); expect(b.tiles).toHaveLength(12);
    expect(b.tiles.every(t => !t.text.includes("example"))).toBe(true);
    const pairs = new Map<string, string[]>(); b.tiles.forEach(t => pairs.set(t.pair, [...(pairs.get(t.pair) ?? []), t.text]));
    for (const [, v] of pairs) expect(v).toHaveLength(2);
    const c = pairsBoard(cards.slice(0, 2), 6);
    expect(c.from).toBe("capitals"); expect(c.tiles.every(t => CAPITALS.flat().includes(t.text))).toBe(true);
  });
});

describe("reminders", () => {
  it("finds the next time today or tomorrow", () => {
    const now = new Date(2026, 10, 13, 8, 0);
    expect(nextAt("07:30", now).getDate()).toBe(14);
    expect(nextAt("19:15", now)).toEqual(new Date(2026, 10, 13, 19, 15));
  });
  it("writes a daily calendar event", () => {
    const ics = dailyIcs("19:15", 20, "https://lumen.example/today", new Date(2026, 10, 13, 8, 0));
    expect(ics).toContain("RRULE:FREQ=DAILY"); expect(ics).toContain("DTSTART:20261113T191500"); expect(ics).toContain("DTEND:20261113T193500");
    expect(ics.split("\r\n")[0]).toBe("BEGIN:VCALENDAR");
    expect(googleCalendarUrl("19:15", 20, "https://x", new Date(2026, 10, 13, 8, 0))).toContain("recur=RRULE%3AFREQ%3DDAILY");
  });
});

describe("weekly review", () => {
  it("sums the last seven days and ignores older ones", () => {
    const s = (day: string, area: string): SessionRecord => ({ day, area, steps: [], minutes: 20, lumens: 70, at: 0 });
    const w = weekSummary({
      stats: { streak: 3, best: 3, lastDay: "2026-11-15", lumens: 0, sessions: [s("2026-11-08", "fr"), s("2026-11-09", "fr"), s("2026-11-10", "fr"), s("2026-11-10", "ps"), s("2026-11-15", "review")] },
      drills: [{ kind: "quiz", score: 3, out: 5, day: "2026-11-12", at: 0 }, { kind: "digit-span", score: 6, day: "2026-11-12", at: 0 }],
    }, "2026-11-15");
    expect(w).toMatchObject({ from: "2026-11-09", sessions: 3, days: 2, minutes: 60, drills: 1, quizzes: { right: 3, out: 5 } });
    expect(w.areas).toEqual([{ area: "fr", sessions: 2 }, { area: "ps", sessions: 1 }]);
  });
  it("keeps only answered prompts", () => {
    expect(reviewEntry("2026-11-15", { well: "Spoke up in meetings", hard: " " }).text).toBe("What went well this week?\nSpoke up in meetings");
  });
});

describe("news from X accounts", () => {
  const raw = [
    { title: "Team news", url: "https://x.com/ManUtd/status/1", source: "Manchester United" },
    { title: "Fan account claim", url: "https://x.com/randomfan/status/2", source: "Fan" },
    { title: "Match report", url: "https://www.bbc.co.uk/sport/1", source: "BBC Sport" },
    { title: "Old domain", url: "https://twitter.com/ManUtd/status/3", source: "Manchester United" },
  ];
  it("allows only the listed account's posts", () => {
    expect(cleanNews(raw, "mu", ["x.com/ManUtd", "bbc.co.uk"]).map(n => n.title)).toEqual(["Team news", "Match report", "Old domain"]);
    expect(cleanNews(raw, "mu", ["twitter.com/manutd"]).map(n => n.title)).toEqual(["Team news", "Old domain"]);
  });
  it("asks for exact post links when X accounts are listed", () => {
    expect(newsPrompt("Manchester United", ["x.com/ManUtd"], [], "2026-11-13")).toContain("/status/");
    expect(newsPrompt("Arsenal", ["bbc.co.uk"], [], "2026-11-13")).not.toContain("/status/");
  });
});
