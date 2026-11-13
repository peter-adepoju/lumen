import { describe, expect, it } from "vitest";
import { seal, unseal } from "./server/seal";
import { pick, wrap } from "./store/merge";
import { dailyExtras, focusFor, rotation, weekPlan } from "./plan";
import { makeArea, slug } from "./model";
import { checkKey, looksLikeKey } from "./gemini";
import { Drive } from "./store/drive";

const SECRET = "a".repeat(40);
const KEY = "AIza" + "B".repeat(35);

describe("session seal", () => {
  it("round-trips and rejects tampering or the wrong secret", async () => {
    const t = await seal({ refreshToken: "r1", sub: "42" }, SECRET);
    expect(await unseal(t, SECRET)).toEqual({ refreshToken: "r1", sub: "42" });
    expect(await unseal(t, "b".repeat(40))).toBeNull();
    expect(await unseal(t.slice(0, -2) + "xx", SECRET)).toBeNull();
    expect(await unseal("garbage", SECRET)).toBeNull();
  });
  it("refuses a short secret", async () => {
    await expect(seal({}, "short")).rejects.toThrow();
  });
});

describe("sync merge", () => {
  it("keeps the newer copy, and the device copy on a tie", () => {
    expect(pick(wrap(1, 100), wrap(2, 200))).toBe("remote");
    expect(pick(wrap(1, 300), wrap(2, 200))).toBe("local");
    expect(pick(wrap(1, 200), wrap(2, 200))).toBe("local");
    expect(pick(null, wrap(2, 1))).toBe("remote");
    expect(pick(wrap(1, 1), null)).toBe("local");
    expect(pick(null, null)).toBe("none");
  });
});

describe("daily plan", () => {
  const areas = [makeArea("Presentation", "skill", true), makeArea("Memory", "mind"), makeArea("French", "lang"), makeArea("Arsenal", "news")];
  it("puts starred areas in twice, never back to back, and leaves out news and paused areas", () => {
    const seq = rotation([...areas, { ...makeArea("Chess", "interest"), freq: "Paused" }]);
    expect(seq.filter(a => a.name === "Presentation")).toHaveLength(2);
    expect(seq.some(a => a.name === "Arsenal" || a.name === "Chess")).toBe(false);
    seq.forEach((a, i) => i && expect(a.id).not.toBe(seq[i - 1].id));
  });
  it("gives every weekday a focus and Sunday a review", () => {
    const week = weekPlan(areas, "Lumen plans each day", new Date(2026, 10, 12));
    expect(week.map(d => d.label)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(week.slice(0, 6).every(d => d.focus)).toBe(true);
    expect(week[6].focus).toBeNull();
  });
  it("is the same on every device for a given day", () => {
    const d = new Date(2026, 10, 13);
    expect(focusFor(areas, "Lumen plans each day", d)?.id).toBe(focusFor([...areas], "Lumen plans each day", new Date(d))?.id);
  });
  it("keeps the starred area every day in 'same focus' mode", () => {
    for (let i = 9; i < 15; i++) expect(focusFor(areas, "Same focus every day", new Date(2026, 10, i))?.name).toBe("Presentation");
  });
  it("lists daily areas alongside the focus", () => {
    expect(dailyExtras(areas, areas[0]).map(a => a.name)).toEqual(["French"]);
  });
  it("makes safe ids from names", () => {
    expect(slug("Faith & scripture!")).toBe("faith-scripture");
  });
});

describe("gemini key", () => {
  it("recognises the shape of a key", () => {
    expect(looksLikeKey(KEY)).toBe(true);
    expect(looksLikeKey(" " + KEY + " ")).toBe(true);
    expect(looksLikeKey("AQ.Ab8RN6" + "Kx_9-z".repeat(10))).toBe(true); // newer AI Studio keys
    expect(looksLikeKey("XYZ" + "q".repeat(60))).toBe(true);            // any future format
    expect(looksLikeKey("AIza123")).toBe(false);                         // half-copied
    expect(looksLikeKey("my key is AIzaSyB0123456789abcdefghij")).toBe(false); // a sentence
    expect(looksLikeKey("")).toBe(false);
  });
  it("explains why Google refused a key", async () => {
    const res = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
    expect(await checkKey(KEY, res(200, {}))).toEqual({ ok: true });
    expect(await checkKey(KEY, res(400, { error: { status: "INVALID_ARGUMENT", message: "API key not valid" } }))).toEqual({ ok: false, reason: "invalid" });
    expect(await checkKey(KEY, res(403, { error: { message: "Generative Language API has not been used in project" } }))).toEqual({ ok: false, reason: "not_enabled" });
    expect(await checkKey(KEY, res(429, {}))).toEqual({ ok: false, reason: "quota" });
    expect(await checkKey("nope", res(200, {}))).toEqual({ ok: false, reason: "format" });
    expect(await checkKey(KEY, (async () => { throw new Error("offline"); }) as unknown as typeof fetch)).toEqual({ ok: false, reason: "network" });
  });
});

describe("drive", () => {
  it("creates the Lumen folder once, then creates and updates a file in it", async () => {
    const calls: { method: string; url: string; body?: string }[] = [];
    const files: { id: string; name: string }[] = [];
    const fake = (async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? "GET";
      calls.push({ method, url, body: typeof init.body === "string" ? init.body : undefined });
      expect((init.headers as Record<string, string>).authorization).toBe("Bearer tok");
      if (method === "GET" && url.includes("/files?")) {
        const q = new URL(url).searchParams.get("q") ?? "";
        return new Response(JSON.stringify({ files: files.filter(f => q.includes(`'${f.name}'`)) }));
      }
      if (method === "POST" && url.includes("/files?fields=id")) { files.push({ id: "folder1", name: "Lumen" }); return new Response(JSON.stringify({ id: "folder1" })); }
      if (method === "POST" && url.includes("uploadType=multipart")) { files.push({ id: "file1", name: "profile.json" }); return new Response(JSON.stringify({ id: "file1" })); }
      if (method === "PATCH") return new Response("{}");
      if (method === "GET" && url.includes("alt=media")) return new Response(JSON.stringify({ v: 1, at: 5 }));
      return new Response("{}", { status: 404 });
    }) as unknown as typeof fetch;
    const d = new Drive(async () => "tok", fake);
    await d.writeJson("profile.json", { v: 1, at: 5 });
    await d.writeJson("profile.json", { v: 2, at: 6 });
    expect(calls.filter(c => c.method === "POST" && c.url.includes("fields=id") && !c.url.includes("upload"))).toHaveLength(1);
    expect(calls.filter(c => c.url.includes("uploadType=multipart"))).toHaveLength(1);
    expect(calls.filter(c => c.method === "PATCH")).toHaveLength(1);
    expect(await d.readJson("profile.json")).toEqual({ v: 1, at: 5 });
  });
});
