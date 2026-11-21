import { describe, expect, it } from "vitest";
import { dailyTasks, taskProgress, type DayInput } from "./day";

const base: DayInput = {
  steps: { "Today's reading": true, "Practise": true, "News brief": true, "Unwind picks": true, "Games": true },
  reviewDay: false, reviewed: false, focusName: "Focus", sessionDone: false, sessionSteps: ["Warm-up", "Learn"],
  dueCount: 0, hasCards: false, book: null, readingDone: false, hasNews: false, unwind: false,
};

describe("dailyTasks", () => {
  it("lists the session as a to-do, then done", () => {
    expect(dailyTasks(base)[0]).toMatchObject({ key: "session", state: "todo", href: "/session" });
    expect(dailyTasks({ ...base, sessionDone: true })[0]).toMatchObject({ key: "session", state: "done", href: "/learn" });
  });

  it("shows the weekly review on Sunday instead of a session", () => {
    const t = dailyTasks({ ...base, reviewDay: true });
    expect(t[0]).toMatchObject({ key: "review", state: "todo" });
    expect(t.some(x => x.key === "session")).toBe(false);
  });

  it("shows due flashcards, and marks them done when caught up", () => {
    expect(dailyTasks({ ...base, hasCards: true, dueCount: 3 }).find(t => t.key === "cards"))
      .toMatchObject({ label: "Review 3 flashcards", state: "todo" });
    expect(dailyTasks({ ...base, hasCards: true, dueCount: 0 }).find(t => t.key === "cards"))
      .toMatchObject({ state: "done" });
    expect(dailyTasks({ ...base, hasCards: false }).some(t => t.key === "cards")).toBe(false);
  });

  it("adds reading only when there's a book today", () => {
    expect(dailyTasks(base).some(t => t.key === "reading")).toBe(false);
    expect(dailyTasks({ ...base, book: { id: "b1", title: "Meditations" }, readingDone: true }).find(t => t.key === "reading"))
      .toMatchObject({ href: "/read/b1", state: "done" });
  });

  it("counts only non-optional tasks toward progress", () => {
    const t = dailyTasks({ ...base, sessionDone: true, hasNews: true, unwind: true, book: { id: "b", title: "B" }, readingDone: false });
    // session (done) + reading (todo) are real; news, unwind, games are optional
    expect(taskProgress(t)).toEqual({ done: 1, total: 2 });
    expect(t.filter(x => x.state === "optional").map(x => x.key)).toEqual(["news", "unwind", "games"]);
  });
});
