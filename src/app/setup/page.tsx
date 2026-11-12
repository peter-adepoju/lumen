import type { Metadata } from "next";
import { Setup } from "@/components/setup";

export const metadata: Metadata = { title: "Set up Lumen" };

export default function SetupPage() {
  return <Setup />;
}
