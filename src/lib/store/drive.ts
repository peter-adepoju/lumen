// The user's own Google Drive as Lumen's database. Lumen only has the
// drive.file permission, so it sees nothing but the files it creates: one
// "Lumen" folder holding one JSON file per document.

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
export const FOLDER_NAME = "Lumen";

export type TokenSource = () => Promise<string>;

export class DriveError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export class Drive {
  private folderId: string | null = null;
  private ids = new Map<string, string>();
  constructor(private token: TokenSource, private fetcher: typeof fetch = (...a) => fetch(...a)) {}

  private async call(url: string, init: RequestInit = {}): Promise<Response> {
    const res = await this.fetcher(url, { ...init, headers: { ...(init.headers as Record<string, string>), authorization: "Bearer " + (await this.token()) } });
    if (!res.ok) throw new DriveError(res.status, `Drive ${res.status}`);
    return res;
  }

  private async find(q: string): Promise<{ id: string; name: string; modifiedTime?: string }[]> {
    const url = `${API}/files?` + new URLSearchParams({ q, spaces: "drive", fields: "files(id,name,modifiedTime)", pageSize: "100" });
    return (await (await this.call(url)).json()).files ?? [];
  }

  async folder(): Promise<string> {
    if (this.folderId) return this.folderId;
    const found = await this.find(`name = '${FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
    if (found[0]) return (this.folderId = found[0].id);
    const res = await this.call(`${API}/files?fields=id`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: FOLDER_NAME, mimeType: "application/vnd.google-apps.folder", description: "Your Lumen data: profile, notes, highlights and progress." }),
    });
    return (this.folderId = (await res.json()).id);
  }

  private async fileId(name: string): Promise<string | null> {
    if (this.ids.has(name)) return this.ids.get(name)!;
    const folder = await this.folder();
    const found = await this.find(`name = '${name.replace(/'/g, "\\'")}' and '${folder}' in parents and trashed = false`);
    if (found[0]) { this.ids.set(name, found[0].id); return found[0].id; }
    return null;
  }

  async readJson<T>(name: string): Promise<T | null> {
    const id = await this.fileId(name);
    if (!id) return null;
    const res = await this.call(`${API}/files/${id}?alt=media`);
    return (await res.json()) as T;
  }

  async writeJson(name: string, value: unknown): Promise<void> {
    const body = JSON.stringify(value, null, 1);
    const id = await this.fileId(name);
    if (id) {
      await this.call(`${UPLOAD}/files/${id}?uploadType=media`, { method: "PATCH", headers: { "content-type": "application/json" }, body });
      return;
    }
    const folder = await this.folder(), boundary = "lumen" + Math.random().toString(36).slice(2);
    const meta = JSON.stringify({ name, parents: [folder], mimeType: "application/json" });
    const multipart = `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\ncontent-type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
    const res = await this.call(`${UPLOAD}/files?uploadType=multipart&fields=id`, { method: "POST", headers: { "content-type": `multipart/related; boundary=${boundary}` }, body: multipart });
    this.ids.set(name, (await res.json()).id);
  }

  async remove(name: string): Promise<void> {
    const id = await this.fileId(name);
    if (id) { await this.call(`${API}/files/${id}`, { method: "DELETE" }); this.ids.delete(name); }
  }
}
