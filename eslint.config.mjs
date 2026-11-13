import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Thumbnails and covers come from many outside sites (YouTube, Open Library, podcast hosts),
    // chosen at run time, so next/image's fixed list of allowed hosts doesn't fit.
    rules: { "@next/next/no-img-element": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "public/sw.js",
    "scripts/sw.template.js",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Copied from pdfjs-dist by scripts/copy-pdfjs.mjs
    "public/pdfjs/**",
  ]),
]);

export default eslintConfig;
