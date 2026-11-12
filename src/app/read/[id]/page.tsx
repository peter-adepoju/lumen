import { Suspense } from "react";
import { ReaderView } from "./reader-view";

export default function ReadPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="grid min-h-dvh place-items-center"><div className="orb size-12" aria-label="Opening the book" /></div>}>
      <Book params={params} />
    </Suspense>
  );
}

async function Book({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReaderView id={decodeURIComponent(id)} />;
}
