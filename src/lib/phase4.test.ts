import { describe, expect, it } from "vitest";
import { addDays, digits, dueCards, newCard, oddGrid, previewIntervals, review } from "./practice";
import { cleanNews, isoWeek, newsPrompt, unwindTime } from "./practice-ai";
import { addLumens, emptyStats } from "./stats";

const DAY = "2026-11-12";
const seq = (vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };

describe("flashcards", () => {
  it("spaces good answers further apart and brings 'again' back today", () => {
    let c = newCard({ id: "c", area: "french", front: "la lumière", back: "light" }, DAY);
    c = review(c, "good", DAY); expect(c).toMatchObject({ interval: 1, due: "2026-11-13", reps: 1 });
    c = review(c, "good", c.due); expect(c).toMatchObject({ interval: 3, due: "2026-11-16" });
    c = review(c, "good", c.due); expect(c.interval).toBe(8);
    const lapsed = review(c, "again", c.due); expect(lapsed).toMatchObject({ interval: 0, reps: 0, lapses: 1, due: c.due });
    expect(lapsed.ease).toBeLessThan(c.ease);
    expect(review(newCard({ id: "e", area: "a", front: "x", back: "y" }, DAY), "easy", DAY).interval).toBe(3);
  });
  it("never lets ease fall below 1.3", () => {
    let c = newCard({ id: "c", area: "a", front: "x", back: "y" }, DAY);
    for (let i = 0; i < 20; i++) c = review(c, "again", DAY);
    expect(c.ease).toBe(1.3);
  });
  it("lists due cards, oldest first, and previews intervals", () => {
    const a = { ...newCard({ id: "a", area: "x", front: "1", back: "1" }, DAY), due: "2026-11-10" };
    const b = { ...newCard({ id: "b", area: "x", front: "2", back: "2" }, DAY), due: DAY };
    const c = { ...newCard({ id: "c", area: "x", front: "3", back: "3" }, DAY), due: "2026-11-20" };
    expect(dueCards([b, c, a], DAY).map(x => x.id)).toEqual(["a", "b"]);
    expect(previewIntervals(b, DAY)).toEqual({ again: "now", hard: "1 day", good: "1 day", easy: "3 days" });
  });
  it("adds days across month and year ends", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });
});

describe("drills", () => {
  it("makes digit strings without repeated neighbours", () => {
    const s = digits(8, seq([0.1, 0.11, 0.5, 0.9, 0.95, 0.3, 0.3, 0.7, 0.2]));
    expect(s).toHaveLength(8);
    for (let i = 1; i < s.length; i++) expect(s[i]).not.toBe(s[i - 1]);
  });
  it("makes an odd-one-out grid that grows with the level", () => {
    const g = oddGrid(0, seq([0, 0.2, 0.5]));
    expect(g.size).toBe(4); expect(g.base).not.toBe(g.odd); expect(g.at).toBeLessThan(16);
    expect(oddGrid(20, seq([0.5])).size).toBe(9);
  });
  it("adds practice lumens without touching the streak", () => {
    expect(addLumens({ ...emptyStats(), streak: 4, lumens: 100 }, 25)).toMatchObject({ streak: 4, lumens: 125 });
  });
});

describe("news", () => {
  const raw = [
    { title: "Club confirms new coach", summary: "s", status: "Confirmed", source: "BBC Sport", url: "https://www.bbc.co.uk/sport/x", date: "2026-11-12" },
    { title: "Club confirms new coach!", summary: "dup", status: "Confirmed", source: "ESPN", url: "https://www.espn.com/y" },
    { title: "Gossip", summary: "s", status: "Weird", source: "Blog", url: "https://gossip.example/z" },
    { title: "No link", summary: "s" },
    { title: "Insecure", url: "http://espn.com/a" },
  ];
  it("keeps each story once, only from allowed sources, with a known label", () => {
    expect(cleanNews(raw, "Football", []).map(n => [n.title, n.status])).toEqual([["Club confirms new coach", "Confirmed"], ["Gossip", "Reported"]]);
    expect(cleanNews(raw, "Football", ["bbc.co.uk", "espn.com"]).map(n => n.source)).toEqual(["BBC Sport"]);
  });
  it("asks for trusted sources, labels and own words", () => {
    const p = newsPrompt("Arsenal", ["bbc.co.uk"], [{ type: "topic", value: "transfer gossip", at: 1 }], DAY);
    expect(p).toContain("Arsenal"); expect(p).toContain("bbc.co.uk"); expect(p).toContain("transfer gossip"); expect(p).toContain("own words");
  });
});

describe("unwind", () => {
  it("shows picks Friday to Sunday and on every 7th day of a streak", () => {
    expect(unwindTime(new Date(2026, 10, 13), 0)).toBe(true);   // Friday
    expect(unwindTime(new Date(2026, 10, 11), 3)).toBe(false);  // Wednesday
    expect(unwindTime(new Date(2026, 10, 11), 14)).toBe(true);
  });
  it("names ISO weeks", () => {
    expect(isoWeek(new Date(2026, 10, 12))).toBe("2026-W46");
    expect(isoWeek(new Date(2027, 0, 1))).toBe("2026-W53");
  });
});
