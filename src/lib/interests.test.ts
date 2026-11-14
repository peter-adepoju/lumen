import { describe, expect, it } from "vitest";
import { addActivity, answer, EMPTY_INTERESTS, interestPrompt, openSuggestions, shouldLook, toSuggestions } from "./interests";
import { importSelahCsv, makeSaved, matches, upsertSaved, fromShare } from "./saved";
import { savedFor } from "./recs";
import { defaultProfile, makeArea } from "./model";

const DAY = 86400_000;
const profile = defaultProfile([makeArea("French", "lang"), makeArea("Manchester United", "news")]);

describe("activity and new interests", () => {
  it("logs activity, ignoring the same search twice in a row", () => {
    let a = addActivity([], { kind: "search", text: "street photography" }, 1000);
    a = addActivity(a, { kind: "search", text: "street photography" }, 2000);
    a = addActivity(a, { kind: "save", text: "Fuji X100 review" }, 3000);
    expect(a.map(x => x.text)).toEqual(["street photography", "Fuji X100 review"]);
  });
  it("looks again only after enough new activity and two days", () => {
    const acts = Array.from({ length: 9 }, (_, i) => ({ kind: "save" as const, text: "x" + i, at: i }));
    expect(shouldLook(EMPTY_INTERESTS, acts, 10 * DAY)).toBe(true);
    expect(shouldLook({ lastRun: 9 * DAY, lastCount: 0, suggestions: [] }, acts, 10 * DAY)).toBe(false);
    expect(shouldLook({ lastRun: 0, lastCount: 5, suggestions: [] }, acts, 10 * DAY)).toBe(false);
  });
  it("keeps only new interests, never ones already there or refused", () => {
    const state = { ...EMPTY_INTERESTS, suggestions: [{ id: "chess", name: "Chess", cat: "interest" as const, why: "", evidence: [], at: 0, status: "no" as const }] };
    const raw = [
      { name: "Street photography", cat: "skill", why: "You saved 5 photography videos.", evidence: ["Fuji X100 review", "Composition basics"] },
      { name: "French", cat: "lang", why: "dup" },
      { name: "Chess", cat: "interest", why: "refused before" },
      { name: "Learn French", cat: "lang", why: "near-dup" },
      { name: "Personal finance", cat: "weird" },
    ];
    const out = toSuggestions(raw, profile, state, 5);
    expect(out.map(s => [s.name, s.cat])).toEqual([["Street photography", "skill"], ["Personal finance", "interest"]]);
    expect(out[0]).toMatchObject({ status: "open", evidence: ["Fuji X100 review", "Composition basics"] });
  });
  it("adds an interest only on yes, in the chosen section; later asks again in two weeks", () => {
    const s0 = { ...EMPTY_INTERESTS, suggestions: toSuggestions([{ name: "Street photography", cat: "skill" }, { name: "Jazz", cat: "interest" }], profile, EMPTY_INTERESTS, 0) };
    const yes = answer(s0, "street-photography", "yes", "interest", 0);
    expect(yes.area).toMatchObject({ name: "Street photography", cat: "interest", from: "noticed" });
    const later = answer(yes.state, "jazz", "later", undefined, 0);
    expect(later.area).toBeUndefined();
    expect(openSuggestions(later.state, DAY)).toHaveLength(0);
    expect(openSuggestions(later.state, 15 * DAY).map(s => s.name)).toEqual(["Jazz"]);
  });
  it("tells the AI what the person did and what they refused", () => {
    const p = interestPrompt(profile, [{ kind: "save", text: "Fuji X100 review", at: 0 }], ["Chess"]);
    expect(p).toContain("save: Fuji X100 review");
    expect(p).toContain("said no to: Chess");
    expect(p).toContain("French (Language)");
  });
});

describe("saved links", () => {
  it("saves with what Lumen found out, keeping your folder and note when saved again", () => {
    const a = makeSaved("https://www.youtube.com/watch?v=AAAAAAAAAAA", { title: "Composition basics", creator: "Sean Tucker", platform: "YouTube", thumb: "https://i.ytimg.com/x.jpg" }, {}, 1)!;
    expect(a).toMatchObject({ title: "Composition basics", kind: "video", platform: "YouTube", folder: "Unsorted" });
    let list = upsertSaved([], { ...a, folder: "Photography", note: "watch twice" });
    list = upsertSaved(list, { ...a, savedAt: 5, tags: ["photo"] });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ folder: "Photography", note: "watch twice", tags: ["photo"], savedAt: 1 });
    expect(matches(list[0], "tucker photo")).toBe(true);
    expect(makeSaved("not a link", null)).toBeNull();
  });
  it("reads a shared page and Selah's Saved spreadsheet", () => {
    expect(fromShare({ text: "Look at this https://example.com/a nice", title: "A" })).toEqual({ url: "https://example.com/a", title: "A" });
    const csv = 'Title,Link,Type,Section,Saved on,Note,Tags,Summary\n"Composition, basics",https://www.youtube.com/watch?v=AAAAAAAAAAA,video,Photography,2026-10-01,my note,"photo, street",\nBad,not-a-link,link,,,,,\n';
    const items = importSelahCsv(csv);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ title: "Composition, basics", folder: "Photography", note: "my note", tags: ["photo", "street"], from: "selah", kind: "video" });
    expect(() => importSelahCsv("a,b\n1,2")).toThrow(/Selah/);
  });
  it("feeds saved links about an area into its recommendations", () => {
    const s = makeSaved("https://example.com/fr", { title: "French listening practice" }, { tags: [] })!;
    const other = makeSaved("https://example.com/x", { title: "Cooking pasta" })!;
    expect(savedFor(makeArea("French", "lang"), [s, other]).map(x => x.url)).toEqual(["https://example.com/fr"]);
  });
});
