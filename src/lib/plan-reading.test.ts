import { describe, expect, it } from "vitest";
import { readingPlan } from "./books/library";
import type { LibraryEntry, ReadingState } from "./model";

const DAY = "2026-11-13";
const entry = (page?: number, total = 200): LibraryEntry => ({ id: "b", title: "Book", author: "A", source: "upload", format: "epub", shelf: "active", words: 1, addedAt: 1, ...(page ? { at: { page, total, pct: Math.round(page / total * 100), chapter: "One" } } : {}) });
const state = (p: Partial<ReadingState>): ReadingState => ({ ch: 0, p: 0, hl: [], notes: [], bookmarks: [], day: DAY, todayFrom: null, readToday: [], ...p });

describe("today's reading follows your place in the book", () => {
  it("starts on the page where you stopped, before you open it today", () => {
    expect(readingPlan(entry(42), state({ day: "2026-11-12", todayFrom: 30, readToday: [29, 30, 31] }), DAY, 5)).toMatchObject({ from: 42, to: 46, read: 0, done: false });
  });
  it("starts at page 1 for a book you haven't opened", () => {
    expect(readingPlan(entry(), undefined, DAY, 5)).toMatchObject({ from: 1, to: 5, read: 0 });
  });
  it("keeps today's range fixed while you read through it", () => {
    // opened today at page 42 (index 41), now on page 44
    const p = readingPlan(entry(44), state({ todayFrom: 41, readToday: [41, 42, 43] }), DAY, 5);
    expect(p).toMatchObject({ from: 42, to: 46, read: 3, done: false });
  });
  it("only counts pages inside today's range", () => {
    // looked back at pages 10 and 11, then read 42 and 43
    expect(readingPlan(entry(43), state({ todayFrom: 41, readToday: [9, 10, 41, 42] }), DAY, 5).read).toBe(2);
  });
  it("is done once today's pages are read, or you've moved past them", () => {
    expect(readingPlan(entry(46), state({ todayFrom: 41, readToday: [41, 42, 43, 44, 45] }), DAY, 5).done).toBe(true);
    expect(readingPlan(entry(60), state({ todayFrom: 41, readToday: [41, 59] }), DAY, 5).done).toBe(true);
  });
  it("stops at the end of the book", () => {
    expect(readingPlan(entry(198, 200), undefined, DAY, 5)).toMatchObject({ from: 198, to: 200, size: 3 });
  });
});
