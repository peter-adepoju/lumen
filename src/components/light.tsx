"use client";
import { useState } from "react";
import { light, type Light } from "@/lib/light";
import { today } from "@/lib/recs";
import { useStore } from "@/lib/store/store";
import { cn } from "./ui";

/** Your light as it stands now, from your sessions, practice, games and reading. */
export function useLight(): Light {
  const s = useStore();
  const [day] = useState(() => today());
  return light({ stats: s.get("stats"), drills: s.get("drills"), games: s.get("games"), journal: s.get("journal"), reading: s.get("reading") }, day);
}

/** The orb, glowing as brightly as you've earned. */
export function LightOrb({ className, l, decorative }: { className?: string; l: Light; decorative?: boolean }) {
  return (
    <span className={cn("orb light-orb block", className)} data-state={l.state} style={{ "--glow": l.level } as React.CSSProperties}
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": `Your light: ${l.label}. ${l.detail}` })} title={`${l.label}. ${l.detail}`} />
  );
}
