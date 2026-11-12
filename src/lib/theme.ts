"use client";
import { useEffect, useState } from "react";

export type Theme = "auto" | "light" | "dark";
const KEY = "lumen:theme";

export function applyTheme(t: Theme) {
  if (t === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", t);
}

/** The theme choice is a per-device convenience, kept in this browser. */
function saved(): Theme {
  if (typeof window === "undefined") return "auto";
  try { return (localStorage.getItem(KEY) as Theme) || "auto"; } catch { return "auto"; }
}

/** Used only after the app has loaded on the device, so reading the saved choice up front is safe. */
export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(saved);
  useEffect(() => { applyTheme(theme); }, [theme]);
  return [theme, (t: Theme) => { setTheme(t); applyTheme(t); try { localStorage.setItem(KEY, t); } catch {} }];
}
