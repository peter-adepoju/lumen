// The user's own Google Drive as Lumen's database. Lumen only has the
// drive.file permission, so it sees nothing but the files it creates: one
// "Lumen" folder holding one JSON file per document, and a "Books" folder
// inside it for the user's books.

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
export const FOLDER_NAME = "Lumen";
const FOLDER_MIME = "application/vnd.google-apps.folder";

export type TokenSource = () => Promise<string>;

export class DriveError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const q = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

export class Drive {
  private folders = new Map<string, string>(); // "" is the Lumen folder, "Books" a subfolder
  private ids = new Map<string, string>();
  constructor(private token: TokenSource, private fetcher: typeof fetch = (...a) => fetch(...a)) {}

  private async call(url: string, init: RequestInit = {}): Promise<Response> {
    const res = await this.fetcher(url, { ...init, headers: { ...(init.headers as Record<string, string>), authorization: "Bearer " + (await this.token()) } });
    if (!res.ok) throw new DriveError(res.status, `Drive ${res.status}`);
    return res;
  }

  private async find(query: string): Promise<{ id: string; name: string; modifiedTime?: string }[]> {
    const url = `${API}/files?` + new URLSearchParams({ q: query, spaces: "drive", fields: "files(id,name,modifiedTime)", pageSize: "100" });
    return (await (await this.call(url)).json()).files ?? [];
  }

  private async makeFolder(name: string, parent?: string): Promise<string> {
    const res = await this.call(`${API}/files?fields=id`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME, ...(parent ? { parents: [parent] } : {}), ...(parent ? {} : { description: "Your Lumen data: profile, notes, highlights, books and progress." }) }),
    });
    return (await res.json()).id;
  }

  /** The Lumen folder, or a subfolder of it such as "Books". */
  async folder(sub = ""): Promise<string> {
    if (this.folders.has(sub)) return this.folders.get(sub)!;
    let id: string;
    if (!sub) {
      const found = await this.find(`name = '${FOLDER_NAME}' and mimeType = '${FOLDER_MIME}' and trashed = false`);
      id = found[0]?.id ?? (await this.makeFolder(FOLDER_NAME));
    } else {
      const root = await this.folder();
      const found = await this.find(`name = '${q(sub)}' and mimeType = '${FOLDER_MIME}' and '${root}' in parents and trashed = false`);
      id = found[0]?.id ?? (await this.makeFolder(sub, root));
    }
    this.folders.set(sub, id);
    return id;
  }

  /** "profile.json" lives in the Lumen folder; "Books/abc.json" in its Books folder. */
  private split(path: string): [string, string] {
    const i = path.lastIndexOf("/");
    return i < 0 ? ["", path] : [path.slice(0, i), path.slice(i + 1)];
  }

  private async fileId(path: string): Promise<string | null> {
    if (this.ids.has(path)) return this.ids.get(path)!;
    const [sub, name] = this.split(path);
    const folder = await this.folder(sub);
    const found = await this.find(`name = '${q(name)}' and '${folder}' in parents and trashed = false`);
    if (found[0]) { this.ids.set(path, found[0].id); return found[0].id; }
    return null;
  }

  async readJson<T>(path: string): Promise<T | null> {
    const id = await this.fileId(path);
    if (!id) return null;
    const res = await this.call(`${API}/files/${id}?alt=media`);
    return (await res.json()) as T;
  }

  async readBlob(path: string): Promise<Blob | null> {
    const id = await this.fileId(path);
    if (!id) return null;
    return (await this.call(`${API}/files/${id}?alt=media`)).blob();
  }

  async writeJson(path: string, value: unknown): Promise<void> {
    await this.write(path, new Blob([JSON.stringify(value)], { type: "application/json" }), "application/json");
  }

  async write(path: string, data: Blob, mime: string): Promise<void> {
    const id = await this.fileId(path);
    if (id) {
      await this.call(`${UPLOAD}/files/${id}?uploadType=media`, { method: "PATCH", headers: { "content-type": mime }, body: data });
      return;
    }
    const [sub, name] = this.split(path);
    const folder = await this.folder(sub), boundary = "lumen" + Math.random().toString(36).slice(2);
    const meta = JSON.stringify({ name, parents: [folder], mimeType: mime });
    const body = new Blob([`--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\ncontent-type: ${mime}\r\n\r\n`, data, `\r\n--${boundary}--`]);
    const res = await this.call(`${UPLOAD}/files?uploadType=multipart&fields=id`, { method: "POST", headers: { "content-type": `multipart/related; boundary=${boundary}` }, body });
    this.ids.set(path, (await res.json()).id);
  }

  async remove(path: string): Promise<void> {
    const id = await this.fileId(path);
    if (id) { await this.call(`${API}/files/${id}`, { method: "DELETE" }); this.ids.delete(path); }
  }
}
