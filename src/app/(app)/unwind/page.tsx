"use client";
import { LanguageFilms, UnwindList } from "@/components/unwind";
import { PageTitle, SectionTitle } from "@/components/ui";
import { useStore } from "@/lib/store/store";

export default function Unwind() {
  const langs = (useStore().get("profile")?.areas ?? []).filter(a => a.cat === "lang" && a.freq !== "Paused");
  return (
    <>
      <PageTitle title="Unwind" sub="All work and no play… A few films and series for your time off. Not a daily thing." />
      <div className="flex max-w-[720px] flex-col gap-3">
        <UnwindList />
        {langs.length > 0 && <>
          <SectionTitle>Learn {langs.map(l => l.name).join(" and ")} through film</SectionTitle>
          <LanguageFilms />
        </>}
      </div>
    </>
  );
}
