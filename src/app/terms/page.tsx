import type { Metadata } from "next";
import Link from "next/link";
import { H2, PublicPage } from "@/components/public-page";

export const metadata: Metadata = { title: "Terms · Lumen", description: "The terms for using Lumen." };

export default function Terms() {
  return (
    <PublicPage title="Terms of use" updated="13 November 2026">
      <p>Lumen is a free tool for personal learning and growth. By using it you agree to these terms.</p>
      <H2>Using Lumen</H2>
      <ul className="list-disc pl-5">
        <li>You must be 16 or older.</li>
        <li>Use Lumen lawfully. Add only books and files you have the right to use.</li>
        <li>You are responsible for your Google account and your Gemini key, including any use of Google&apos;s services under their own terms.</li>
      </ul>
      <H2>Recommendations and AI</H2>
      <p>Recommendations, summaries, feedback, news briefs and quizzes are made by AI and checked where possible, but they can be wrong or out of date. They are not professional, medical, legal or financial advice. Content from other sites belongs to its owners.</p>
      <H2>Your data</H2>
      <p>Your data is yours and lives in your own Google Drive and on your device. See the <Link href="/privacy" className="underline underline-offset-4">privacy policy</Link>.</p>
      <H2>No warranty</H2>
      <p>Lumen is provided as is, without warranties of any kind. It may change or stop at any time. To the extent the law allows, Lumen&apos;s makers are not liable for any loss arising from its use. Keep your own copies of anything important; you can export your data at any time.</p>
      <H2>Changes</H2>
      <p>These terms may be updated; the date above shows the latest version.</p>
    </PublicPage>
  );
}
