"use client";
import Link from "next/link";
import { NewsBrief } from "@/components/news";
import { Card, PageTitle } from "@/components/ui";
import { useStore } from "@/lib/store/store";

export default function News() {
  const s = useStore();
  const topics = (s.get("profile")?.areas ?? []).filter(a => a.cat === "news" && a.freq !== "Paused");
  return (
    <>
      <PageTitle title="News" sub="Every story in today's brief, topic by topic. Refresh any time for the latest." />
      <div className="max-w-[720px]">
        {topics.length ? <NewsBrief topics={topics} /> : (
          <Card><p className="text-[14px]">You&apos;re not following any news yet. <Link href="/setup?step=2" className="underline underline-offset-4">Choose news to follow</Link>, like your club or AI news.</p></Card>
        )}
      </div>
    </>
  );
}
