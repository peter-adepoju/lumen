"use client";
import { useStore } from "@/lib/store/store";
import { DigitSpan, Flashcards, OddOneOut, Quiz } from "@/components/practice";
import { PageTitle, SectionTitle } from "@/components/ui";

export default function Practice() {
  const s = useStore();
  const p = s.get("profile")!;
  const areas = p.areas.filter(a => a.cat !== "news" && a.freq !== "Paused");
  const topics = [...new Set([...areas.map(a => a.name), ...p.areas.filter(a => a.cat === "news").map(a => a.name), "General knowledge"])];
  return (
    <>
      <PageTitle title="Practice" sub="Flashcards, drills and quizzes. Each one earns lumens." />
      <div className="flex flex-col gap-3.5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-8">
        <div className="flex flex-col gap-3.5">
          <SectionTitle right="Spaced repetition">Flashcards</SectionTitle>
          <Flashcards areas={areas} />
          <SectionTitle right="Built from your interests">Quiz</SectionTitle>
          <Quiz topics={topics} />
        </div>
        <div className="flex flex-col gap-3.5">
          <SectionTitle right="Train your mind">Drills</SectionTitle>
          <DigitSpan />
          <OddOneOut />
        </div>
      </div>
    </>
  );
}
