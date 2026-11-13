import type { Metadata } from "next";
import Link from "next/link";
import { H2, PublicPage } from "@/components/public-page";

export const metadata: Metadata = { title: "About Lumen", description: "Lumen helps you get a little better every day, in calm focus, using your own Google Drive and your own free AI key." };

export default function About() {
  return (
    <PublicPage title="Grow a little every day.">
      <p className="text-[18px]">Lumen learns what you want to get better at, from public speaking to French to personal finance, and brings the right videos, books, podcasts and practice into one calm place. No feeds, no likes, no endless scrolling.</p>
      <H2>What it does</H2>
      <ul className="list-disc pl-5">
        <li>A short daily session for one focus area: a warm-up, something to learn, a practice exercise with feedback, and a private reflection.</li>
        <li>Real, checked recommendations you watch, listen to and read inside Lumen, and it remembers where you stopped.</li>
        <li>A library with a book-like reader, highlights, notes and exports; free classics from Project Gutenberg.</li>
        <li>Flashcards, brain drills, quizzes and games; a weekly review; progress you can see.</li>
        <li>A short daily news brief from sources you trust, and a few films or series for your time off.</li>
      </ul>
      <H2>Your data, your tools</H2>
      <p>Lumen is free. It stores what you do in a <strong>Lumen</strong> folder in your own Google Drive and on your device, and uses your own free Gemini key for AI. Lumen has no database of its own. Read the <Link href="/privacy" className="underline underline-offset-4">privacy policy</Link> for the details.</p>
      <p><Link href="/today" className="inline-block rounded-full bg-primary px-4 py-2 text-[14px] font-medium text-on-primary no-underline">Start with Lumen</Link></p>
    </PublicPage>
  );
}
