// Exports a book's highlights and notes as Word, PDF or Markdown.
// Used by the PDF reader; it makes the same documents as the book reader's export.

export const HL_COLORS: Record<string, string> = { yellow: "#F6D55C", green: "#8ED081", blue: "#8EC5F0", pink: "#F4A3C8", orange: "#F7B267", purple: "#C3A6F2", teal: "#7FD6CB", red: "#F28B82" };
export const HL_NAMES: Record<string, string> = { yellow: "Yellow", green: "Green", blue: "Blue", pink: "Pink", orange: "Orange", purple: "Purple", teal: "Teal", red: "Red" };

export interface ExportItem { kind: "highlight" | "note"; text: string; note?: string; color?: string; page: number; at: number; section: string }
export interface ExportBook { title: string; author: string }
export type ExportFormat = "docx" | "pdf" | "md";

const fmtDate = (t: number) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const metaLine = (it: ExportItem) => [`Page ${it.page}`, it.kind === "highlight" ? `${HL_NAMES[it.color ?? "yellow"] ?? "Yellow"} highlight` : "Note", fmtDate(it.at)].join(" · ");

function model(book: ExportBook, items: ExportItem[]) {
  const sections: { title: string; items: ExportItem[] }[] = [];
  for (const it of items) {
    let g = sections.find(s => s.title === it.section);
    if (!g) { g = { title: it.section, items: [] }; sections.push(g); }
    g.items.push(it);
  }
  return { title: `${book.title}: notes and highlights`, meta: `${book.author} · exported from Lumen on ${fmtDate(Date.now())}`, sections };
}

export function asMarkdown(book: ExportBook, items: ExportItem[]): string {
  const m = model(book, items);
  let s = `# ${m.title}\n\n_${m.meta}_\n\n`;
  for (const c of m.sections) {
    s += `## ${c.title}\n\n`;
    for (const it of c.items) {
      if (it.kind === "highlight") s += `> ${it.text}\n\n`;
      const note = it.kind === "note" ? it.text : it.note;
      if (note) s += `**${it.kind === "note" ? "Note" : "My note"}:** ${note}\n\n`;
      s += `_${metaLine(it)}_\n\n`;
    }
  }
  return s;
}

const xmlEsc = (s: string) => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

export async function asDocx(book: ExportBook, items: ExportItem[]): Promise<Blob> {
  const JSZip = (await import("jszip")).default;
  const m = model(book, items), W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const run = (t: string, rpr?: string) => `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ""}<w:t xml:space="preserve">${xmlEsc(t)}</w:t></w:r>`;
  const para = (inner: string, ppr?: string) => `<w:p>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ""}${inner}</w:p>`;
  let body = para(run(m.title), `<w:pStyle w:val="Title"/>`) + para(run(m.meta, `<w:color w:val="777777"/><w:sz w:val="18"/>`));
  for (const c of m.sections) {
    body += para(run(c.title), `<w:pStyle w:val="Heading1"/>`);
    for (const it of c.items) {
      if (it.kind === "highlight") body += para(run(it.text, "<w:i/>"), `<w:pBdr><w:left w:val="single" w:sz="24" w:space="8" w:color="${(HL_COLORS[it.color ?? "yellow"] ?? "#BBBBBB").slice(1)}"/></w:pBdr><w:shd w:val="clear" w:color="auto" w:fill="F7F5F0"/><w:spacing w:before="200" w:after="60"/><w:ind w:left="240"/>`);
      const note = it.kind === "note" ? it.text : it.note;
      if (note) body += para(run(it.kind === "note" ? "Note: " : "My note: ", "<w:b/>") + run(note), `<w:spacing w:after="40"/><w:ind w:left="240"/>`);
      body += para(run(metaLine(it), `<w:color w:val="888888"/><w:sz w:val="16"/>`), `<w:spacing w:after="160"/><w:ind w:left="240"/>`);
    }
  }
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1300" w:right="1300" w:bottom="1300" w:left="1300" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`);
  zip.file("word/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="${W}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia" w:cs="Georgia"/><w:sz w:val="22"/><w:lang w:val="en-GB"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="44"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="360" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="30"/></w:rPr></w:style></w:styles>`);
  return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

export async function asPdf(book: ExportBook, items: ExportItem[]): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const d = new jsPDF({ unit: "pt", format: "a4" });
  const latin = (s: string) => String(s).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...").replace(/·/g, "-").replace(/[^\x00-\xFF]/g, "?");
  const m = model(book, items), PW = 595, PH = 842, M = 64, TW = PW - 2 * M;
  let y = M;
  const need = (h: number) => { if (y + h > PH - M) { d.addPage(); y = M; } };
  const text = (s: string, font: string, style: string, size: number, color: number, x: number, w: number) => {
    d.setFont(font, style); d.setFontSize(size); d.setTextColor(color);
    const lines: string[] = d.splitTextToSize(latin(s), w), lh = size * 1.4;
    for (const l of lines) { need(lh); d.text(l, x, y + size); y += lh; }
    return lines.length * lh;
  };
  text(m.title, "times", "bold", 22, 30, M, TW); y += 4;
  text(m.meta, "helvetica", "normal", 9, 120, M, TW); y += 14;
  for (const c of m.sections) {
    need(48); y += 10; text(c.title, "times", "bold", 15, 30, M, TW);
    d.setDrawColor(210); d.line(M, y + 2, PW - M, y + 2); y += 12;
    for (const it of c.items) {
      if (it.kind === "highlight") {
        const y0 = y, hex = HL_COLORS[it.color ?? "yellow"] ?? "#BBBBBB";
        const h = text(it.text, "times", "italic", 12, 40, M + 14, TW - 14);
        d.setFillColor(parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16));
        if (y > y0) d.rect(M, y0 + 2, 4, Math.min(h, y - y0) - 2, "F");
      }
      const note = it.kind === "note" ? it.text : it.note;
      if (note) { y += 2; text(`${it.kind === "note" ? "Note: " : "My note: "}${note}`, "helvetica", "normal", 10.5, 50, M + 14, TW - 14); }
      text(metaLine(it), "helvetica", "normal", 8.5, 140, M + 14, TW - 14);
      y += 12;
    }
  }
  const n = d.getNumberOfPages();
  for (let i = 1; i <= n; i++) { d.setPage(i); d.setFont("helvetica", "normal"); d.setFontSize(8); d.setTextColor(150); d.text(`${latin(book.title)} - ${i} / ${n}`, PW / 2, PH - 32, { align: "center" }); }
  return d.output("blob");
}

/** Builds the file and downloads it. */
export async function downloadExport(book: ExportBook, items: ExportItem[], fmt: ExportFormat) {
  const data = fmt === "md" ? new Blob([asMarkdown(book, items)], { type: "text/markdown;charset=utf-8" }) : fmt === "docx" ? await asDocx(book, items) : await asPdf(book, items);
  const name = `${book.title} - notes and highlights.${fmt}`.replace(/[\\/:*?"<>|]+/g, " ");
  const url = URL.createObjectURL(data), a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return name;
}
