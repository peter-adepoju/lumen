import { Card, PageTitle } from "./ui";

/** A calm placeholder for parts of Lumen still being built. */
export function Coming({ title, sub, items }: { title: string; sub: string; items: string[] }) {
  return (
    <>
      <PageTitle title={title} sub={sub} />
      <Card className="flex flex-col gap-2">
        <span className="eyebrow">Coming next</span>
        <ul className="flex flex-col gap-1.5 text-[14px]">
          {items.map(i => <li key={i} className="flex gap-2"><span className="text-gold" aria-hidden>·</span>{i}</li>)}
        </ul>
      </Card>
    </>
  );
}
