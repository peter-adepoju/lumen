import type { BookDoc, ReaderSettings, ReadingState } from "../model";

export interface ReaderOptions {
  root: HTMLElement;
  book: BookDoc;
  state?: Partial<ReadingState>;
  settings?: ReaderSettings;
  sheet?: "notes" | "export" | "contents" | "search" | "type";
  onSave?: (bookId: string, state: ReadingState, settings: ReaderSettings) => void;
  onClose?: (page: number, total: number) => void;
  explain?: (prompt: string) => Promise<string>;
  /** For fixed-layout books (PDFs): draws PDF page n (1-based) at a CSS width, returning an image URL and the page's own paper colour. */
  renderPage?: (n: number, cssWidth: number) => Promise<{ url: string; bg: string } | null>;
}

export interface Reader {
  open(o: ReaderOptions): Promise<void>;
  close(): void;
  destroy(): void;
}

export function createReader(): Reader;
