// Copies pdf.js's worker and font data into public/pdfjs so PDFs can be read
// from the app's own address (runs before dev and build).
import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules/pdfjs-dist");
const out = join(root, "public/pdfjs");
mkdirSync(out, { recursive: true });
cpSync(join(src, "build/pdf.worker.min.mjs"), join(out, "pdf.worker.min.mjs"));
for (const d of ["cmaps", "standard_fonts"]) cpSync(join(src, d), join(out, d), { recursive: true });
console.log("pdf.js assets → public/pdfjs");
