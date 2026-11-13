"use client";
import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { BottomNav, SiteFooter, SiteHeader } from "@/components/nav";
import { store, useStore } from "@/lib/store/store";
import { useTheme } from "@/lib/theme";
import { useReminder, useServiceWorker } from "@/components/pwa";

/**
 * Two layouts from one set of pages:
 * - Phones and small tablets: an app — single column, compact headers, tab bar at the bottom.
 * - Wide screens (1024px and up): a website — header with links, wide multi-column pages, footer.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  const s = useStore();
  const router = useRouter();
  useTheme();
  useServiceWorker();
  useReminder();
  useEffect(() => { store.init().then(() => { if (!store.get("profile")) router.replace("/setup"); }); }, [router]);
  if (!s.loaded || !s.get("profile")) return <main className="grid min-h-dvh place-items-center"><div className="orb size-12" aria-label="Loading" /></main>;
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-[460px] flex-1 flex-col gap-3.5 pb-28 pt-3 [padding-left:max(16px,env(safe-area-inset-left))] [padding-right:max(16px,env(safe-area-inset-right))] lg:max-w-[1160px] lg:gap-6 lg:px-8 lg:pb-20 lg:pt-12">
        {children}
      </main>
      <SiteFooter />
      <BottomNav />
    </div>
  );
}
