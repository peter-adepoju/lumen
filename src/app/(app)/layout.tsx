"use client";
import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { BottomNav } from "@/components/nav";
import { store, useStore } from "@/lib/store/store";
import { useTheme } from "@/lib/theme";

export default function AppLayout({ children }: { children: ReactNode }) {
  const s = useStore();
  const router = useRouter();
  useTheme();
  useEffect(() => { store.init().then(() => { if (!store.get("profile")) router.replace("/setup"); }); }, [router]);
  if (!s.loaded || !s.get("profile")) return <main className="grid min-h-dvh place-items-center"><div className="orb size-12" aria-label="Loading" /></main>;
  return (
    <>
      <main className="mx-auto flex max-w-[460px] flex-col gap-3.5 pb-28 pt-3 [padding-left:max(16px,env(safe-area-inset-left))] [padding-right:max(16px,env(safe-area-inset-right))]">
        {children}
      </main>
      <BottomNav />
    </>
  );
}
