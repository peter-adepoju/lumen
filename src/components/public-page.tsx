import Link from "next/link";
import type { ReactNode } from "react";

/** A plain public page (About, Privacy, Terms): readable without signing in or setting anything up. */
export function PublicPage({ title, updated, children }: { title: string; updated?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-[760px] items-center justify-between px-5">
          <Link href="/about" className="flex items-center gap-2.5"><span className="orb size-6" aria-hidden /><span className="font-display text-[24px] font-semibold leading-none">Lumen</span></Link>
          <Link href="/today" className="rounded-full bg-primary px-3.5 py-1.5 text-[13.5px] font-medium text-on-primary">Open Lumen</Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[760px] flex-1 px-5 py-10 lg:py-14">
        <h1 className="text-[40px] leading-tight lg:text-[52px]">{title}</h1>
        {updated && <p className="mt-1 text-[13px] text-muted">Last updated {updated}</p>}
        <div className="prose-lumen mt-6 flex flex-col gap-4 text-[15.5px] leading-relaxed">{children}</div>
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-[760px] flex-wrap gap-x-5 gap-y-1 px-5 py-6 text-[13px] text-muted">
          <Link href="/about" className="hover:text-fg">About</Link>
          <Link href="/privacy" className="hover:text-fg">Privacy</Link>
          <Link href="/terms" className="hover:text-fg">Terms</Link>
          <a href="https://github.com/peter-adepoju/lumen" className="hover:text-fg">Source code</a>
        </div>
      </footer>
    </div>
  );
}

export function H2({ children }: { children: ReactNode }) {
  return <h2 className="mt-4 text-[26px]">{children}</h2>;
}
