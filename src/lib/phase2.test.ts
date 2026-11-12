import { describe, expect, it } from "vitest";
import { classify, isPrivateAddress, itemId, youtubeIds } from "./links";
import { extractJson, generate, AiError } from "./gemini";
import { blockedBy, buildPrompt, findPicks, keep, picksFor, savePickSet, wantedKinds, type Suggestion } from "./recs";
import { completeSession, currentStreak, emptyStats, level } from "./stats";
import { defaultProfile, makeArea, type Item } from "./model";

describe("links", () => {
  it("reads YouTube videos, Shorts, playlists and short links", () => {
    expect(youtubeIds("https://www.youtube.com/watch?v=w82a1FT5o88")).toEqual({ video: "w82a1FT5o88", playlist: undefined });
    expect(youtubeIds("https://youtu.be/w82a1FT5o88?t=30")).toEqual({ video: "w82a1FT5o88", playlist: undefined });
    expect(youtubeIds("https://youtube.com/shorts/Cm3tqJA6KTY")).toEqual({ video: "Cm3tqJA6KTY", short: true });
    expect(youtubeIds("https://www.youtube.com/playlist?list=PL8dPuuaLjXtNgK6MZucdYldNkMybYIHKR").playlist).toBe("PL8dPuuaLjXtNgK6MZucdYldNkMybYIHKR");
    expect(youtubeIds("https://www.youtube.com/watch?v=w82a1FT5o88&list=RDw82a1FT5o88").playlist).toBeUndefined();
  });
  it("classifies platforms and kinds", () => {
    expect(classify("https://youtube.com/shorts/Cm3tqJA6KTY")).toMatchObject({ platform: "YouTube Shorts", kind: "clip" });
    expect(classify("https://www.youtube.com/playlist?list=PL8dPuuaLjXtNgK6MZucdYldNkMybYIHKR")).toMatchObject({ kind: "playlist" });
    expect(classify("https://www.tiktok.com/@askvinh/video/7598441975922150676")).toMatchObject({ platform: "TikTok", kind: "clip" });
    expect(classify("https://podcasts.apple.com/us/podcast/x/id1?i=1000779333097")).toMatchObject({ platform: "Apple Podcasts", kind: "podcast" });
    expect(classify("https://www.gutenberg.org/ebooks/2680")).toMatchObject({ platform: "Project Gutenberg", kind: "book" });
    expect(classify("https://paulgraham.com/simply.html")).toMatchObject({ kind: "article", platform: "Paulgraham" });
    expect(classify("javascript:alert(1)")).toBeNull();
    expect(classify("not a link")).toBeNull();
  });
  it("gives the same id for the same canonical link", () => {
    const a = classify("https://youtu.be/w82a1FT5o88")!.canonical, b = classify("https://www.youtube.com/watch?v=w82a1FT5o88&t=4")!.canonical;
    expect(itemId(a)).toBe(itemId(b));
  });
  it("refuses private network addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "::1", "fd00::1", "::ffff:127.0.0.1", "0.0.0.0"]) expect(isPrivateAddress(ip)).toBe(true);
    for (const ip of ["8.8.8.8", "142.250.72.14", "2606:4700::1111"]) expect(isPrivateAddress(ip)).toBe(false);
  });
});

describe("AI replies", () => {
  it("finds JSON inside code fences and chatter", () => {
    expect(extractJson('Here you go:\n```json\n[{"a":1}]\n```\nEnjoy')).toEqual([{ a: 1 }]);
    expect(extractJson('Sure! {"x": "has ] and } inside", "y": [1,2]} trailing')).toEqual({ x: "has ] and } inside", y: [1, 2] });
    expect(extractJson("no json here")).toBeNull();
  });
  it("turns Google's errors into plain reasons", async () => {
    const f = (status: number) => (async () => new Response("{}", { status })) as unknown as typeof fetch;
    await expect(generate("k", "hi", { fetcher: f(429) })).rejects.toMatchObject({ reason: "quota" });
    await expect(generate("k", "hi", { fetcher: f(400) })).rejects.toMatchObject({ reason: "key" });
    await expect(generate("k", "hi", { fetcher: f(500) })).rejects.toBeInstanceOf(AiError);
  });
  it("asks for Google Search when wanted", async () => {
    let body = "";
    const f = (async (_: string, init: RequestInit) => { body = String(init.body); return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "[]" }] } }] })); }) as unknown as typeof fetch;
    await generate("k", "hi", { fetcher: f, search: true });
    expect(JSON.parse(body).tools).toEqual([{ google_search: {} }]);
  });
});

const area = makeArea("Public speaking", "skill");
const it_ = (o: Partial<Item>): Item => ({ id: "x", kind: "video", url: "https://x", title: "T", creator: "C", platform: "YouTube", area: area.id, ...o });

describe("recommendations", () => {
  it("maps formats to kinds, defaulting to everything", () => {
    expect(wantedKinds(["Podcasts", "Books"])).toEqual(["podcast", "book"]);
    expect(wantedKinds([])).toContain("video");
  });
  it("puts goal, likes, dislikes and blocks into the prompt", () => {
    const profile = { ...defaultProfile([area]), goal: "Lead my team" };
    const prompt = buildPrompt({ area, profile, blocked: [{ type: "creator", value: "Bad Channel", at: 1 }], feedback: [{ id: "a", title: "Great talk", creator: "TED", platform: "YouTube", area: area.id, rating: "up", at: 1 }], added: [], exclude: ["Old pick"], count: 5 });
    expect(prompt).toContain("Lead my team");
    expect(prompt).toContain("Great talk (TED, YouTube)");
    expect(prompt).toContain("creator: Bad Channel");
    expect(prompt).toContain("Old pick");
    expect(prompt).toContain("Google Search");
  });
  it("drops blocked items, items rated down and duplicates", () => {
    const items = [it_({ id: "1", creator: "Bad Channel" }), it_({ id: "2", title: "Crypto riches" }), it_({ id: "3" }), it_({ id: "3" }), it_({ id: "4", platform: "TikTok" }), it_({ id: "5" })];
    const blocked = [{ type: "creator" as const, value: "bad channel", at: 1 }, { type: "topic" as const, value: "crypto", at: 1 }, { type: "platform" as const, value: "TikTok", at: 1 }];
    const kept = keep(items, area, blocked, [{ id: "5", title: "T", creator: "C", platform: "YouTube", area: area.id, rating: "down", at: 1 }]);
    expect(kept.map(i => i.id)).toEqual(["3"]);
    expect(blockedBy(it_({ title: "Anything" }), area, [{ type: "topic", value: "Public speaking", at: 1 }])).not.toBeNull();
  });
  it("keeps only suggestions the link checker confirms", async () => {
    const sugg: Suggestion[] = [
      { kind: "video", title: "Real talk", url: "https://youtu.be/w82a1FT5o88", why: "Fits you" },
      { kind: "video", title: "Made up", url: "https://youtu.be/AAAAAAAAAAA" },
      { kind: "book", title: "On Writing Well", creator: "William Zinsser" },
    ];
    const items = await findPicks({
      key: "k", area, docs: { profile: defaultProfile([area]) },
      ask: (async () => sugg) as never,
      check: async c => c.map(s => (s.title === "Made up" ? null : { id: itemId(s.title), kind: s.kind, url: s.url ?? "https://openlibrary.org/works/x", title: s.title, creator: s.creator ?? "", platform: "X" })),
    });
    expect(items.map(i => i.title)).toEqual(["Real talk", "On Writing Well"]);
    expect(items[0]).toMatchObject({ why: "Fits you", area: area.id });
  });
  it("saves one set per area per day", () => {
    let sets = savePickSet(undefined, { area: "a", day: "2026-11-12", items: [], at: 1 });
    sets = savePickSet(sets, { area: "a", day: "2026-11-12", items: [it_({})], at: 2 });
    expect(sets).toHaveLength(1);
    expect(picksFor(sets, "a", "2026-11-12")?.items).toHaveLength(1);
    expect(picksFor(sets, "a", "2026-11-13")).toBeUndefined();
  });
});

describe("streaks", () => {
  const rec = (day: string, lumens = 70) => ({ day, area: "a", steps: [], minutes: 20, lumens, at: 1 });
  it("grows on consecutive days, holds on the same day, and restarts after a gap", () => {
    let s = completeSession(emptyStats(), rec("2026-11-10"));
    s = completeSession(s, rec("2026-11-11"));
    s = completeSession(s, rec("2026-11-11", 10));
    expect(s).toMatchObject({ streak: 2, best: 2, lumens: 150 });
    expect(currentStreak(s, "2026-11-12")).toBe(2);
    expect(currentStreak(s, "2026-11-13")).toBe(0);
    s = completeSession(s, rec("2026-11-14"));
    expect(s).toMatchObject({ streak: 1, best: 2 });
  });
  it("crosses month and year ends", () => {
    let s = completeSession(emptyStats(), rec("2026-12-31"));
    s = completeSession(s, rec("2027-01-01"));
    expect(s.streak).toBe(2);
  });
  it("names levels from lumens", () => {
    expect(level(0)).toMatchObject({ name: "Spark", next: "Glow", toNext: 1000 });
    expect(level(2340)).toMatchObject({ name: "Glow", next: "Lamp", toNext: 660, pct: 67 });
    expect(level(20000)).toMatchObject({ name: "Radiance", next: null });
  });
});
