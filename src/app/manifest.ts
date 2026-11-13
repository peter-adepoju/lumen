import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/today",
    name: "Lumen",
    short_name: "Lumen",
    description: "Grow a little every day.",
    start_url: "/today",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    launch_handler: { client_mode: "focus-existing" },
    background_color: "#F7F5F0",
    theme_color: "#F7F5F0",
    categories: ["education", "productivity", "books"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
    // Shown in the install window on computers (wide) and phones (narrow).
    screenshots: [
      { src: "/screenshots/today-wide.png", sizes: "1280x800", type: "image/png", form_factor: "wide", label: "Today: your focus, reading and week" },
      { src: "/screenshots/today-narrow.png", sizes: "780x1688", type: "image/png", form_factor: "narrow", label: "Today on your phone" },
    ],
    shortcuts: [
      { name: "Today's session", url: "/session" },
      { name: "Library", url: "/library" },
      { name: "Practice", url: "/practice" },
    ],
  };
}
