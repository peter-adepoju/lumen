"use client";
import Link from "next/link";
import type { DayTask } from "@/lib/day";
import { taskProgress } from "@/lib/day";
import { Card, cn } from "@/components/ui";

/** Everything to do today, across the whole app, as one checklist at the top of Today. */
export function TodayTasks({ tasks }: { tasks: DayTask[] }) {
  if (tasks.length === 0) return null;
  const { done, total } = taskProgress(tasks);
  const allDone = total > 0 && done === total;

  return (
    <Card className="flex flex-col gap-1">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="eyebrow">Today&apos;s tasks</span>
        {total > 0 && <span className="text-[12.5px] text-muted">{allDone ? "All done ✓" : <><span className="tabular text-fg">{done}</span> of <span className="tabular">{total}</span> done</>}</span>}
      </div>
      <ul className="flex flex-col">
        {tasks.map(t => (
          <li key={t.key}>
            <Link href={t.href} className="flex items-center gap-3 border-t border-border py-2.5 first:border-t-0 hover:bg-surface-2 -mx-1 px-1 rounded-[8px]">
              <Mark state={t.state} />
              <span className="min-w-0 flex-1">
                <span className={cn("text-[14.5px]", t.state === "done" && "text-muted line-through")}>{t.label}</span>
                {t.detail && <span className="block truncate text-[12px] text-muted">{t.detail}</span>}
              </span>
              {t.state !== "done" && (
                <span aria-hidden className="text-muted"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg></span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** The leading status dot: a filled check when done, a gold ring to do, a faint dot for optional. */
function Mark({ state }: { state: DayTask["state"] }) {
  if (state === "done") return (
    <span aria-label="Done" className="grid size-5 shrink-0 place-items-center rounded-full bg-gold text-on-primary">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 13l4 4L19 7" /></svg>
    </span>
  );
  if (state === "optional") return <span aria-label="Optional" className="size-5 shrink-0 grid place-items-center"><span className="size-2 rounded-full bg-border" /></span>;
  return <span aria-label="To do" className="size-5 shrink-0 rounded-full border-[1.5px] border-gold" />;
}
