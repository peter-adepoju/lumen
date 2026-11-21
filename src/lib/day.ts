// Everything to do today, gathered from across the app into one list for the Today page.
// A pure function so it's easy to test: the page works out each input and this arranges them.

export type TaskState = "done" | "todo" | "optional";
export interface DayTask { key: string; label: string; detail?: string; href: string; state: TaskState }

export interface DayInput {
  steps: Record<string, boolean>;        // profile.steps: which parts of the day are switched on
  reviewDay: boolean;                    // Sunday
  reviewed: boolean;                     // the weekly review is done
  focusName: string | null;             // today's focus area, if any
  sessionDone: boolean;                  // today's session is finished
  sessionSteps: string[];               // the enabled session steps, for the detail line
  dueCount: number;                     // flashcards due today
  hasCards: boolean;                    // the user has any flashcards at all
  book: { id: string; title: string } | null; // today's book, if any
  readingDone: boolean;                 // they've read today
  hasNews: boolean;                     // they follow any news topic
  unwind: boolean;                      // it's an Unwind day
}

/** The day's tasks, most important first. "optional" tasks are nice-to-haves and don't count toward "done". */
export function dailyTasks(i: DayInput): DayTask[] {
  const out: DayTask[] = [];

  if (i.reviewDay) {
    out.push({ key: "review", label: "Weekly review", href: "/review", state: i.reviewed ? "done" : "todo",
      detail: i.reviewed ? "Done — enjoy your Sunday" : "About 10 minutes · keeps your streak" });
  } else if (i.focusName) {
    out.push({ key: "session", label: "Today's session", href: i.sessionDone ? "/learn" : "/session", state: i.sessionDone ? "done" : "todo",
      detail: i.sessionDone ? "Done for today" : [i.focusName, i.sessionSteps.join(", ")].filter(Boolean).join(" · ") });
  }

  if (i.steps["Today's reading"] && i.book) {
    out.push({ key: "reading", label: "Today's reading", href: `/read/${i.book.id}`, state: i.readingDone ? "done" : "todo", detail: i.book.title });
  }

  if (i.steps["Practise"] && i.hasCards) {
    out.push({ key: "cards", label: i.dueCount > 0 ? `Review ${i.dueCount} flashcard${i.dueCount === 1 ? "" : "s"}` : "Flashcards", href: "/practice",
      state: i.dueCount > 0 ? "todo" : "done", detail: i.dueCount > 0 ? "due today" : "All caught up" });
  }

  if (i.steps["News brief"] && i.hasNews) {
    out.push({ key: "news", label: "Catch up on your news", href: "/news", state: "optional" });
  }
  if (i.steps["Unwind picks"] && i.unwind) {
    out.push({ key: "unwind", label: "An Unwind pick", href: "/unwind", state: "optional", detail: "something to enjoy" });
  }
  if (i.steps["Games"]) {
    out.push({ key: "games", label: "A quick game", href: "/play", state: "optional", detail: "Pairs or Target" });
  }

  return out;
}

/** How many of the real (non-optional) tasks are done, for the "X of Y" line. */
export function taskProgress(tasks: DayTask[]): { done: number; total: number } {
  const real = tasks.filter(t => t.state !== "optional");
  return { done: real.filter(t => t.state === "done").length, total: real.length };
}
