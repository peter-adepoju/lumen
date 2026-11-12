"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { store } from "@/lib/store/store";

/** Sends people to setup the first time, and to Today after that. */
export default function Home() {
  const router = useRouter();
  useEffect(() => {
    store.init().then(() => router.replace(store.get("profile") ? "/today" : "/setup"));
  }, [router]);
  return <main className="grid min-h-dvh place-items-center"><div className="orb size-12" aria-label="Loading Lumen" /></main>;
}
