"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "./ui";

const TABS = [
  { href: "/today", label: "Today", icon: <><circle cx="12" cy="12" r="4.5" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></> },
  { href: "/learn", label: "Learn", icon: <><path d="M3 5.5c3-1.5 6-1.5 9 .5 3-2 6-2 9-.5V19c-3-1.5-6-1.5-9 .5-3-2-6-2-9-.5z" /><path d="M12 6v13.5" /></> },
  { href: "/library", label: "Library", icon: <><rect x="4" y="4" width="4" height="16" rx="1" /><rect x="9.5" y="4" width="4" height="16" rx="1" /><path d="M15.2 5.6l3.6-1 3.4 14.6-3.6 1z" /></> },
  { href: "/practice", label: "Practice", icon: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" fill="currentColor" /></> },
  { href: "/progress", label: "Progress", icon: <><path d="M3 20h18" /><path d="M4 15l5-5 4 3 7-7" /></> },
];

export function BottomNav() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-[color-mix(in_srgb,var(--bg)_86%,transparent)] pt-1.5 backdrop-blur-md [padding-bottom:calc(6px+env(safe-area-inset-bottom))]">
      <div className="mx-auto grid max-w-[460px] grid-cols-5">
        {TABS.map(t => {
          const on = path.startsWith(t.href);
          return (
            <Link key={t.href} href={t.href} aria-current={on ? "page" : undefined}
              className={cn("flex flex-col items-center gap-0.5 py-1 text-[10.5px]", on ? "font-medium text-fg" : "text-muted")}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={on ? "text-gold" : ""} aria-hidden>{t.icon}</svg>
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
