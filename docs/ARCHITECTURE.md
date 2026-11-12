# How Lumen fits together

Lumen is a Next.js app (App Router, Next.js 16) that runs almost entirely on the user's device. Each person brings their own storage (Google Drive) and their own AI (a Gemini key), so Lumen stays free at any scale.

```mermaid
flowchart LR
  subgraph Device["User's device"]
    UI[Lumen app] --> Store[Store]
    Store --> IDB[(IndexedDB copy)]
    UI -- own Gemini key --> Gemini[Google Gemini API]
  end
  subgraph Server["Lumen on Vercel"]
    Auth[/api/auth/*/]
  end
  Store -- short-lived token --> Auth
  Auth -- refresh token in sealed cookie --> Google[Google OAuth]
  Store -- drive.file --> Drive[(User's Drive: Lumen folder)]
```

## Sign-in

- `/api/auth/google/start` sends the user to Google with PKCE and a random `state`. Scopes: `openid email profile drive.file`, with offline access.
- `/api/auth/google/callback` checks `state`, exchanges the code, and stores the session (Google refresh token included) in an `httpOnly` cookie sealed with AES-256-GCM (`src/lib/server/seal.ts`). There is no database of tokens.
- `/api/auth/token` hands the app a short-lived Google access token for Drive, refreshing it when needed.
- `/api/auth/signout` clears the cookie; `?disconnect=1` also revokes Lumen's access at Google.

## Storage (`src/lib/store`)

- `idb.ts`: a small key-value store in IndexedDB. Every read comes from here, so the app opens instantly and works offline.
- `drive.ts`: the Drive client. It finds or creates the `Lumen` folder and keeps one JSON file per document (`profile.json`, `ai.json`, `blocked.json`, `added.json`).
- `merge.ts`: every document is saved as `{ v, at }`. When the device and Drive disagree, the newer copy wins; on a tie the device copy stays.
- `store.ts`: writes go to the device first, are marked dirty, and sync to Drive about a second later, or when the device comes back online. `useStore()` re-renders components when anything changes.

Users who skip Google sign-in use "device" mode: everything stays in IndexedDB until they connect Drive from the You page.

## AI (`src/lib/gemini.ts`)

The user's own key is checked with Google (`GET /v1beta/models`) before it's saved, and every AI call goes straight from the device to Google. The key is stored only in the user's Drive and on their device.

## Daily plan (`src/lib/plan.ts`)

A pure function, so every device picks the same focus for the same day. Weekly and Daily areas appear once per cycle, starred areas twice (never on consecutive days), "Sometimes" areas every second cycle, and Sunday is the weekly review. News topics and paused areas never become a focus.

## Recommendations (`src/lib/recs.ts`, `src/lib/server/verify.ts`)

1. On the device, the user's own Gemini (with Google Search) is asked for specific, real items for one area. The prompt carries the goal, preferred formats, recent likes and dislikes, level feedback, links they added and everything they blocked.
2. `/api/verify` checks each suggestion and fills in title, creator, thumbnail and an embeddable player: YouTube oEmbed for videos, Shorts and playlists; TikTok, Vimeo, TED and X oEmbed; Open Library for books; Apple's podcast search for episodes; and a safe page fetch for articles (public addresses only, 3 redirects, 300 KB). Suggestions it can't confirm are dropped. It never sees user data or keys, and is rate-limited.
3. Blocked and down-rated items are filtered out, and the day's picks are saved (`picks.json`), so Learn doesn't change every time it opens.

## Daily session (`src/app/(app)/session`, `src/lib/session-ai.ts`, `src/lib/stats.ts`)

Warm-up questions, today's pick, a practice exercise with AI feedback, and a private reflection (`journal.json`, never sent to the AI). Finishing updates `stats.json`: streak (consecutive days), best streak and lumens (10/20/30/10 per step).

## Player (`src/components/player.tsx`)

YouTube plays through the IFrame API on youtube-nocookie with related videos off, saving position (and playlist index) every few seconds to `progress.json`; podcasts play in an audio player that also resumes.

## Design system

Tokens live in `src/app/globals.css` (ivory `#F7F5F0`, charcoal `#17161C`, antique gold `#B08D4F`, plus a dark theme). Fonts are bundled from npm (`@fontsource`), so they work offline: Cormorant Garamond for headings, Jost for text, JetBrains Mono for numbers. Shared components are in `src/components/ui.tsx`.

## Tests

`npm test` covers the cookie seal, sync merge rules, the daily plan, the Gemini key check, the Drive client (against a fake Drive), link recognition, the private-address guard, JSON extraction from AI replies, block filtering, the find-picks flow (with a fake AI and checker), and streaks and levels.
