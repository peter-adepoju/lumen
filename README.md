# Lumen

Grow a little every day. Lumen learns what a person wants to get better at (skills, languages, habits, interests) and brings the right videos, books, podcasts, news and practice into one calm place, with no feeds and no distractions.

Lumen runs on each person's own tools:

- **Storage:** their own Google Drive. Everything goes into a `Lumen` folder, with a working copy on the device so the app is instant and works offline.
- **AI:** their own free Gemini key, so everyone has their own daily allowance.
- **Lumen's server** keeps nothing but the sign-in cookie, which lives in the person's own browser.

## What's built (phase 1)

| Part | Status |
| --- | --- |
| Design system: Cormorant Garamond and Jost, ivory and charcoal, hairline cards, small pill buttons, light and dark | Done |
| Google sign-in (OAuth with PKCE), sealed session cookie, short-lived Drive tokens | Done |
| Storage: on-device copy (IndexedDB) synced to the user's Drive, newest copy wins, works offline | Done |
| Setup: Google → connect your Gemini key → areas → goal → how you learn → your plan | Done |
| Today: the day's focus from a rotation that weights starred areas, daily extras, the week, followed news topics | Done |
| You: your tools, areas (star, frequency, add, remove), your day, blocked items, theme, export and clear data | Done |
| Learn: daily picks per area from the user's own Gemini (with Google Search), every link checked before it's shown, filters, block and rate from any pick, add your own links | Done |
| Player inside Lumen: YouTube videos, Shorts and playlists (no related videos), podcasts, TikTok, Vimeo and TED; resumes where you stopped | Done |
| Daily session: AI warm-up, today's pick, AI-written practice with feedback, private reflection; streak and lumens | Done |
| Library: shelves (currently reading, reserve, finished), upload EPUB and PDF you own, search and download free classics from Project Gutenberg, all highlights and notes in one place | Done |
| Reader: real pagination, two-page spread on wide screens, 3D page turns on generated paper, book typefaces, 8-colour highlights, notes, bookmarks, search, read aloud, explain with your own AI, export notes to Word, PDF, Markdown, text, web page or CSV | Done |
| Today's reading: a few pages a day from where you stopped, taking turns between books | Done |
| Practice: spaced-repetition flashcards (your own, AI-made per area, or from book highlights), digit span and odd-one-out drills, AI quizzes on any area; all earn lumens | Done |
| Progress: streak, lumens and level, 12-week heatmap, levels per area, drill trends, and what Lumen knows about you (editable) | Done |
| News: a daily brief per followed topic from your trusted sources (websites or X accounts, set on You), labelled Confirmed, Reported, Rumour, Fixture or Research; same story once; every link checked | Done |
| Unwind: a few films, series or documentaries each week, fun first with something useful inside; on Today from Friday to Sunday or every 7th streak day | Done |
| Weekly review on Sundays: the week in numbers, private reflection, star areas for next week; keeps the streak | Done |
| Works offline and installs as an app (service worker, phone icons, shortcuts) | Done |
| Reminders: a daily calendar event (Google Calendar or .ics) and a notification while Lumen is open or installed | Done |
| News from X: an X account as a trusted source allows only that account's posts, shown inside Lumen | Done |
| Play: Pairs (built from your flashcards) and Target (reach a number with + − × ÷) | Done |

The full product spec and the clickable prototype are linked from the project conversation.

## Run it

```bash
npm install
cp .env.example .env.local   # optional: add Google settings, see SETUP.md
npm run dev
```

Without Google settings, Lumen still runs and saves everything on the device.

```bash
npm test          # unit tests (sign-in seal, sync, daily plan, Gemini key check, Drive client)
npm run lint
npm run typecheck
npm run build
```

See [SETUP.md](SETUP.md) to set up Google sign-in and deploy to Vercel, and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how it fits together.
