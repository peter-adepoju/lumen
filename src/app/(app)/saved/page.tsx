"use client";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { SavedView } from "@/components/saved";
import { PageTitle } from "@/components/ui";

function Saved() {
  const p = useSearchParams();
  const share = p.get("url") || p.get("text") ? { url: p.get("url"), text: p.get("text"), title: p.get("title") } : undefined;
  return (
    <>
      <PageTitle title="Saved" sub="Links you keep: videos, podcasts and clips play right here. What you save also helps Lumen notice what interests you." />
      <div className="max-w-[760px]"><SavedView share={share} openId={p.get("open")} /></div>
    </>
  );
}

export default function Page() {
  return <Suspense><Saved /></Suspense>;
}
