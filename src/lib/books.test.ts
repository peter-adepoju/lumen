// Book importers, tested with short sample texts written for these tests.
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { parseGutenbergText, wordCount } from "./books/text";
import { decodeEntities, parseEpub, xhtmlBlocks } from "./books/epub";
import { pageParagraphs } from "./books/pdf";
import { parseOpds } from "./server/gutenberg";

const long = (seed: string) => `${seed} ` + "The lamp was lit early and the work went on through the evening, one careful page after another, until the street outside had gone quiet. ".repeat(2);

const SAMPLE = [
  "The Project Gutenberg eBook of A Small Sample Book",
  "",
  "Title: A Small Sample Book",
  "",
  "Author: Ada Example",
  "",
  "*** START OF THE PROJECT GUTENBERG EBOOK A SMALL SAMPLE BOOK ***",
  "",
  "A SMALL SAMPLE BOOK",
  "",
  "By Ada Example",
  "",
  "CONTENTS",
  "",
  "I. The First Morning",
  "II. The Second Morning",
  "",
  "CHAPTER I",
  "",
  "THE FIRST MORNING",
  "",
  long("She woke before the birds") ,
  "",
  long("The kettle sang and she wrote _three_ lines\nbefore breakfast"),
  "",
  "CHAPTER II",
  "",
  "THE SECOND MORNING",
  "",
  long("On the second day the rain came"),
  "",
  "*** END OF THE PROJECT GUTENBERG EBOOK A SMALL SAMPLE BOOK ***",
  "",
  "Full license text that must never appear in the book.",
].join("\r\n");

describe("plain-text books", () => {
  it("reads title and author, drops the header, contents and licence, and finds chapters", () => {
    const b = parseGutenbergText(SAMPLE);
    expect(b.title).toBe("A Small Sample Book");
    expect(b.author).toBe("Ada Example");
    expect(b.chapters.map(c => [c.title, c.sub])).toEqual([["Chapter I", "The First Morning"], ["Chapter II", "The Second Morning"]]);
    expect(b.chapters[0].paras).toHaveLength(2);
    expect(b.chapters[0].paras[1]).toContain("she wrote three lines before breakfast");
    expect(JSON.stringify(b)).not.toContain("license");
    expect(wordCount(b.chapters)).toBeGreaterThan(80);
  });
  it("splits a book with no headings into parts", () => {
    const text = Array.from({ length: 70 }, (_, i) => long(`Paragraph ${i}.`)).join("\n\n");
    const b = parseGutenbergText(text);
    expect(b.chapters.map(c => c.title)).toEqual(["Part 1", "Part 2", "Part 3"]);
    expect(b.chapters[2].paras).toHaveLength(10);
  });
});

async function makeEpub(opts: { nav: boolean }): Promise<Uint8Array> {
  const z = new JSZip();
  z.file("mimetype", "application/epub+zip");
  z.file("META-INF/container.xml", `<?xml version="1.0"?><container><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);
  z.file("OEBPS/content.opf", `<package><metadata><dc:title>Lanterns &amp; Ledgers</dc:title><dc:creator>Ben Sample</dc:creator><meta name="cover" content="cov"/></metadata>
    <manifest><item id="cov" href="img/cover.png" media-type="image/png"/>${opts.nav ? '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>' : ""}<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="t" href="text/title.xhtml" media-type="application/xhtml+xml"/><item id="c1" href="text/c1.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="text/c2.xhtml" media-type="application/xhtml+xml"/></manifest>
    <spine toc="ncx"><itemref idref="t"/><itemref idref="c1"/><itemref idref="c2"/></spine></package>`);
  z.file("OEBPS/img/cover.png", new Uint8Array([137, 80, 78, 71]));
  if (opts.nav) z.file("OEBPS/nav.xhtml", `<html><body><nav><ol><li><a href="text/c1.xhtml">One: Lighting</a></li><li><a href="text/c2.xhtml#top">Two: Counting</a></li></ol></nav></body></html>`);
  z.file("OEBPS/toc.ncx", `<ncx><navMap><navPoint><navLabel><text>From NCX one</text></navLabel><content src="text/c1.xhtml"/></navPoint></navMap></ncx>`);
  z.file("OEBPS/text/title.xhtml", `<html><body><h1>Lanterns</h1></body></html>`);
  z.file("OEBPS/text/c1.xhtml", `<html><head><style>p{}</style></head><body><div class="chapter"><h2>Lighting</h2><p>${long("First light,&nbsp;and the wick &#8212; trimmed.")}</p><p>Second <em>paragraph</em> with a<br/>break.</p></div></body></html>`);
  z.file("OEBPS/text/c2.xhtml", `<html><body><h2>Counting</h2><p>${long("They counted the coins")}</p></body></html>`);
  return z.generateAsync({ type: "uint8array" });
}

describe("EPUB books", () => {
  it("reads metadata, chapter names from the table of contents, paragraphs and the cover", async () => {
    const b = await parseEpub(await makeEpub({ nav: true }));
    expect(b.title).toBe("Lanterns & Ledgers");
    expect(b.author).toBe("Ben Sample");
    expect(b.chapters.map(c => c.title)).toEqual(["One: Lighting", "Two: Counting"]);
    expect(b.chapters[0].paras[0]).toMatch(/^First light, and the wick — trimmed\./);
    expect(b.chapters[0].paras[1]).toBe("Second paragraph with a break.");
    expect(b.cover?.type).toBe("image/png");
  });
  it("falls back to the older NCX table of contents, then to headings", async () => {
    const b = await parseEpub(await makeEpub({ nav: false }));
    expect(b.chapters.map(c => c.title)).toEqual(["From NCX one", "Counting"]);
  });
  it("rejects files that aren't EPUBs", async () => {
    const z = new JSZip(); z.file("hello.txt", "hi");
    await expect(parseEpub(await z.generateAsync({ type: "uint8array" }))).rejects.toThrow("not_epub");
  });
  it("decodes entities and keeps block order", () => {
    expect(decodeEntities("A &amp; B &#x2019;s &lsquo;x&rsquo; &bogus;")).toBe("A & B ’s ‘x’ &bogus;");
    expect(xhtmlBlocks("<body><h1>T</h1><p>a</p><ul><li>b</li></ul><blockquote>c</blockquote></body>").map(b => b.text)).toEqual(["T", "a", "b", "c"]);
  });
});

describe("PDF text", () => {
  const item = (str: string, y: number) => ({ str, transform: [1, 0, 0, 12, 72, y], height: 12 });
  it("joins lines into paragraphs, rejoins hyphenated words and drops page numbers", () => {
    const paras = pageParagraphs([item("The first line of a para-", 700), item("graph continues here.", 686), item("A new paragraph starts", 650), item("after a gap.", 636), item("12", 60)]);
    expect(paras).toEqual(["The first line of a paragraph continues here.", "A new paragraph starts after a gap."]);
  });
});

describe("Project Gutenberg search", () => {
  it("reads books from the OPDS feed", () => {
    const xml = `<feed><entry><id>https://www.gutenberg.org/ebooks/123.opds</id><title>A Sample &amp; Its Title</title><content type="text">Ada Example</content></entry><entry><id>https://www.gutenberg.org/ebooks/search.opds/?sort_order=title</id><title>Sort by title</title></entry></feed>`;
    expect(parseOpds(xml)).toEqual([{ id: 123, title: "A Sample & Its Title", author: "Ada Example", cover: "https://www.gutenberg.org/cache/epub/123/pg123.cover.medium.jpg" }]);
  });
});

describe("headings", () => {
  it("keeps Roman numerals after chapter words, but not in ordinary words", () => {
    const t = (h: string) => parseGutenbergText(["*** START OF THE PROJECT GUTENBERG EBOOK X ***", "", h, "", long("a"), "", "PART TWO", "", long("b")].join("\n")).chapters[0].title;
    expect(t("CHAPTER XIV")).toBe("Chapter XIV");
    expect(t("THE MIX OF CIVIL LIFE")).toBe("The Mix of Civil Life");
    expect(t("BOOK III")).toBe("Book III");
  });
});

import { lookFromCss } from "./books/epub";
describe("a book's own look", () => {
  it("finds the page colour and text colour for html, body and the body's classes", () => {
    const look = lookFromCss([
      { css: "/* publisher */ html { background: #fff } body.calibre { background-color: #F4ECD8; color: #3b2f1e } p { color: red }", base: "OEBPS/styles.css" },
    ], ["calibre"]);
    expect(look).toEqual({ bg: "#F4ECD8", fg: "#3b2f1e" });
  });
  it("reads a background image (resolved against the stylesheet) and the colour in the shorthand", () => {
    expect(lookFromCss([{ css: ".page { background: url('../images/paper.jpg') #efe6d2 no-repeat center / cover }", base: "OEBPS/css/book.css" }], ["page"]))
      .toEqual({ bg: "#efe6d2", image: "OEBPS/images/paper.jpg" });
  });
  it("treats plain white or transparent as no background", () => {
    expect(lookFromCss([{ css: "body { background-color: white; color: #000 }", base: "a.css" }], []).bg).toBeUndefined();
    expect(lookFromCss([{ css: "body { background: rgba(255, 255, 255, 1) }", base: "a.css" }], []).bg).toBeUndefined();
  });
  it("ignores rules for other elements and classes the body doesn't have", () => {
    expect(lookFromCss([{ css: ".dark { background: #111 } div body { background: #222 }", base: "a.css" }], ["light"])).toEqual({});
  });
  it("lets the body's own style attribute win", () => {
    expect(lookFromCss([{ css: "body { background: #eee }", base: "a.css" }], [], "background-color: #fdf6e3").bg).toBe("#fdf6e3");
  });
});

import { pageItems, pageText } from "./books/pdf";
describe("real PDF pages", () => {
  it("keeps each word box from the top of the page, and the page text matches the boxes exactly", () => {
    const items = pageItems([
      { str: "Hello", transform: [12, 0, 0, 12, 72, 700], height: 12, width: 30 },
      { str: " ", transform: [12, 0, 0, 12, 102, 700], height: 12, width: 3 },
      { str: "world", transform: [12, 0, 0, 12, 105, 700], height: 12, width: 31 },
    ], 792);
    expect(items).toEqual([["Hello", 72, 80, 30, 12], ["world", 105, 80, 31, 12]]);
    const text = pageText(items);
    expect(text).toBe("Hello world");
    // every word sits at the offset the reader's highlights use
    let at = 0; for (const it of items) { expect(text.slice(at, at + it[0].length)).toBe(it[0]); at += it[0].length + 1; }
  });
});
