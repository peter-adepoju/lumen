import { describe, expect, it } from "vitest";
import type { BookDoc } from "../model";
import { boundaries, headingOf, planProgress, planToday, positionOf, toThemeCuts, unitsOf } from "./daily";

const para = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ") + ".";
// 230 words a minute: a 20-minute day is 4600 words.
const doc: BookDoc = {
  id: "b", title: "Book", author: "A", chapters: [
    { title: "Chapter 1: Beginnings", paras: [para(1000), para(1000), para(1000)] },                       // 3000 words, fits
    { title: "Chapter 2: The Long One", paras: [para(1500), "Faith and Works", para(2000), para(2000), "THE SECOND PART", para(2500), para(2500)] }, // 2 sections
    { title: "Chapter 3: Short", paras: [para(500)] },
    { title: "Chapter 4: Short too", paras: [para(500)] },
    { title: "Chapter 5: Endless", paras: Array.from({ length: 12 }, () => para(1500)) },               // 18000 words, no headings
  ],
};
const units = unitsOf(doc);
const b = boundaries(doc, units);
const at = (ch: number, p: number) => positionOf(doc, { ch, p, hl: [], notes: [], bookmarks: [], day: null, todayFrom: null, readToday: [] });

describe("today's reading as a whole piece", () => {
  it("spots headings", () => {
    expect(headingOf("Faith and Works")).toBe("Faith and Works");
    expect(headingOf("THE SECOND PART")).toBe("THE SECOND PART");
    expect(headingOf("2.3 Faith and works")).toBe("2.3 Faith and works");
    expect(headingOf("Chapter 4")).toBe("Chapter 4");
    expect(headingOf("He went home and slept.")).toBeNull();
    expect(headingOf("but then")).toBeNull();
  });
  it("gives a whole chapter when it fits", () => {
    const p = planToday(doc, units, b, 0, 20, "d")!;
    expect(p).toMatchObject({ start: 0, end: at(1, 0), kind: "chapter", title: "Chapter 1: Beginnings", next: "Chapter 2: The Long One" });
  });
  it("splits a long chapter at its subheadings", () => {
    const p = planToday(doc, units, b, at(1, 0), 20, "d")!;
    expect(p).toMatchObject({ start: at(1, 0), end: at(1, 4), kind: "section", next: "THE SECOND PART" });
    const q = planToday(doc, units, b, at(1, 4), 20, "d")!;
    expect(q).toMatchObject({ start: at(1, 4), end: at(2, 0), title: "THE SECOND PART" });
  });
  it("puts short chapters together, never cutting one", () => {
    const p = planToday(doc, units, b, at(2, 0), 20, "d")!;
    expect(p.start).toBe(at(2, 0));
    expect(p.end).toBe(at(4, 0));
    expect(p.kind).toBe("chapters");
  });
  it("starts at the beginning of a piece you've only just started", () => {
    expect(planToday(doc, units, b, at(1, 2), 20, "d")!.start).toBe(at(1, 1));
  });
  it("a long chapter with nothing to split it by: a part ending at a paragraph; with AI themes: a theme", () => {
    const p = planToday(doc, units, b, at(4, 0), 20, "d")!;
    expect(p.kind).toBe("part");
    expect(p.words).toBeGreaterThanOrEqual(4500);
    expect(p.words).toBeLessThanOrEqual(6100);
    const themes = { 4: toThemeCuts([{ start: 3, title: "Why it matters", about: "x" }, { start: 6, title: "How to begin" }, { start: 99, title: "bad" }], 12) };
    expect(themes[4].map(t => t.start)).toEqual([3, 6]);
    const q = planToday(doc, units, boundaries(doc, units, themes), at(4, 0), 20, "d")!;
    expect(q).toMatchObject({ start: at(4, 0), end: at(4, 3), next: "Why it matters" });
  });
  it("tracks progress through the piece", () => {
    const p = planToday(doc, units, b, 0, 20, "d")!;
    expect(planProgress(units, p, 0)).toEqual({ fraction: 0, done: false });
    expect(planProgress(units, p, 1).fraction).toBeCloseTo(1 / 3, 2);
    expect(planProgress(units, p, 2).done).toBe(true);
  });
});
