"use client";
import { UnwindList } from "@/components/unwind";
import { PageTitle } from "@/components/ui";

export default function Unwind() {
  return (
    <>
      <PageTitle title="Unwind" sub="All work and no play… A few films and series for your time off. Not a daily thing." />
      <div className="max-w-[720px]"><UnwindList /></div>
    </>
  );
}
