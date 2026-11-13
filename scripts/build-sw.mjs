// Writes public/sw.js from scripts/sw.template.js with a new version, so each
// build replaces the old offline copy (runs before dev and build).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const version = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || Date.now().toString(36);
writeFileSync(join(root, "public/sw.js"), readFileSync(join(root, "scripts/sw.template.js"), "utf8").replace("__VERSION__", version));
console.log(`service worker ${version} → public/sw.js`);
