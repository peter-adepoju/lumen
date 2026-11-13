"use client";
import { Pairs, Target } from "@/components/games";
import { PageTitle } from "@/components/ui";

export default function Play() {
  return (
    <>
      <PageTitle title="Play" sub="Short games for a break. They still train something, and they earn lumens." />
      <div className="flex flex-col gap-3.5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-8">
        <Pairs />
        <Target />
      </div>
    </>
  );
}
