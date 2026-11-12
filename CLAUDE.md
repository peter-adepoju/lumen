@AGENTS.md

# Lumen

- Product spec and decisions: see README.md and docs/ARCHITECTURE.md.
- Each user's data lives in their own Google Drive (`Lumen` folder) with an IndexedDB copy; never add a server database for user content.
- AI calls use the user's own Gemini key from the device; never send the key to Lumen's server.
- Keep the design system in `src/app/globals.css` and `src/components/ui.tsx`: Cormorant Garamond and Jost, hairline borders, small pill buttons, no shadows.
- Before finishing a change, run `npm test`, `npm run lint`, `npm run typecheck` and `npm run build`.
