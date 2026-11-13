import type { Metadata } from "next";
import { H2, PublicPage } from "@/components/public-page";

export const metadata: Metadata = { title: "Privacy · Lumen", description: "How Lumen handles your data: in your own Google Drive and on your device, with no Lumen database." };

const A = ({ href, children }: { href: string; children: string }) => <a href={href} className="underline underline-offset-4">{children}</a>;

export default function Privacy() {
  return (
    <PublicPage title="Privacy policy" updated="13 November 2026">
      <p>Lumen is built so that your data stays yours. In short: what you do in Lumen is saved in your own Google Drive and on your own device. Lumen does not run a database of its own, does not sell or share your data, and shows no ads.</p>

      <H2>What Lumen stores, and where</H2>
      <ul className="list-disc pl-5">
        <li><strong>On your device:</strong> a working copy of your Lumen data (in your browser&apos;s storage), so the app is fast and works offline.</li>
        <li><strong>In your Google Drive</strong>, if you sign in with Google: a folder called <em>Lumen</em> with the same data as small files: your areas and goal, settings, saved and added links, ratings and blocks, progress, journal entries and reflections, streak and scores, flashcards, news and film picks, and your library (books you add and your highlights, notes and bookmarks).</li>
        <li><strong>Your Gemini key</strong>, if you add one, is saved with your settings on your device and in your Drive folder. It is used only from your device to call Google&apos;s Gemini service, and is never sent to Lumen&apos;s server.</li>
      </ul>
      <p>If you choose &quot;Continue on this device&quot;, nothing goes to Google Drive and your data stays only on that device.</p>

      <H2>Google sign-in and Google Drive</H2>
      <p>When you sign in, Lumen asks Google for your name, email address and profile picture (to show who is signed in), and for access to <strong>only the Drive files Lumen creates</strong> (the <code>drive.file</code> permission). Lumen cannot see or change any other file in your Drive.</p>
      <p>To keep you signed in, Lumen&apos;s server places an encrypted cookie in your browser that holds your Google sign-in. The server uses it only to give your browser short-lived access to your own Lumen folder. The server does not keep a copy of it, or of your data.</p>
      <p>Lumen&apos;s use and transfer of information received from Google APIs adheres to the <A href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</A>, including the Limited Use requirements. Lumen does not use your Google data for advertising, does not sell it, does not let people read it, and does not use it to train AI models.</p>

      <H2>AI</H2>
      <p>AI features run with your own Gemini key. Your browser sends requests directly to Google&apos;s Gemini service, under <A href="https://ai.google.dev/gemini-api/terms">Google&apos;s Gemini API terms</A>. Requests include what the feature needs, such as your areas, goal and the content you ask about. Your private reflections and weekly review answers are never sent to the AI.</p>

      <H2>What Lumen&apos;s server sees</H2>
      <ul className="list-disc pl-5">
        <li><strong>Link checks:</strong> before a link is shown to you, the server checks that it is real by asking the site (for example YouTube or Open Library) for its public title. It sees only the public link, not who you are.</li>
        <li><strong>Free classics:</strong> book searches and downloads from Project Gutenberg pass through the server.</li>
        <li><strong>News:</strong> for your daily brief, the names of the news topics you follow (and the websites you trust for them) pass through the server to Google News, which returns public headlines. Nothing about you is sent with them, and nothing is kept.</li>
        <li><strong>Hosting:</strong> Lumen runs on Vercel, which keeps standard technical logs (such as IP address and pages requested) for security and reliability. Lumen adds no analytics or tracking.</li>
      </ul>

      <H2>Content from other sites</H2>
      <p>Videos, podcasts and posts play inside Lumen through the sites&apos; own players: YouTube (privacy-enhanced mode), Vimeo, TED, TikTok, Apple Podcasts and X. When you open one, that site receives your request under its own privacy policy. X posts load only when you tap &quot;Show the post&quot;.</p>

      <H2>Your choices</H2>
      <ul className="list-disc pl-5">
        <li><strong>Export</strong> everything at any time from You → Export my data.</li>
        <li><strong>Delete</strong> Lumen from a device with You → Clear this device, and delete the <em>Lumen</em> folder in your Google Drive to remove your synced data.</li>
        <li><strong>Revoke access</strong> at any time from your <A href="https://myaccount.google.com/permissions">Google account permissions</A>.</li>
      </ul>

      <H2>Children</H2>
      <p>Lumen is for people aged 16 and over.</p>

      <H2>Changes and contact</H2>
      <p>If this policy changes, the date above changes with it. For questions, open an issue on <A href="https://github.com/peter-adepoju/lumen/issues">Lumen&apos;s GitHub page</A>.</p>
    </PublicPage>
  );
}
