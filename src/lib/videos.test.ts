import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { channelIdFromPage, channelRef, parseVideoFeed } from "./server/videos";
import { defaultChannels, faviconFor, isVideoSource, normaliseVideoSource, relevantVideos } from "./news";

// A made-up feed in YouTube's channel feed (Atom) format.
const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
 <yt:channelId>UCabcdefghijklmnopqrstuv</yt:channelId><title>Example Sports</title>
 <entry><id>yt:video:AAAAAAAAAAA</id><yt:videoId>AAAAAAAAAAA</yt:videoId><title>Manchester United 2-1 Arsenal | Highlights</title>
  <author><name>Example Sports</name></author><published>2026-11-13T20:00:00+00:00</published>
  <media:group><media:community><media:statistics views="12000"/></media:community></media:group></entry>
 <entry><yt:videoId>BBBBBBBBBBB</yt:videoId><title>Golf &amp; tennis round-up</title><author><name>Example Sports</name></author><published>2026-11-13T18:00:00+00:00</published></entry>
 <entry><yt:videoId>bad</yt:videoId><title>Broken</title><published>2026-11-13T18:00:00+00:00</published></entry>
</feed>`;

describe("news videos", () => {
  it("reads a YouTube channel feed", () => {
    const v = parseVideoFeed(FEED);
    expect(v).toHaveLength(2);
    expect(v[0]).toMatchObject({ id: "AAAAAAAAAAA", title: "Manchester United 2-1 Arsenal | Highlights", channel: "Example Sports", channelId: "UCabcdefghijklmnopqrstuv", url: "https://www.youtube.com/watch?v=AAAAAAAAAAA", thumb: "https://i.ytimg.com/vi/AAAAAAAAAAA/mqdefault.jpg" });
    expect(v[1].title).toBe("Golf & tennis round-up");
  });
  it("understands channel links, handles and ids", () => {
    expect(channelRef("https://www.youtube.com/@SkySportsNews")).toEqual({ handle: "SkySportsNews" });
    expect(channelRef("youtube.com/channel/UCabcdefghijklmnopqrstuv")).toEqual({ id: "UCabcdefghijklmnopqrstuv" });
    expect(channelRef("bbc.co.uk")).toBeNull();
    expect(channelIdFromPage('<link rel="canonical" href="https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv">')).toBe("UCabcdefghijklmnopqrstuv");
    expect(normaliseVideoSource("@SkySportsNews")).toBe("youtube.com/@SkySportsNews");
    expect(normaliseVideoSource("https://www.youtube.com/@BBCSport/videos")).toBe("youtube.com/@BBCSport");
    expect(normaliseVideoSource("manutd.com")).toBeNull();
    expect(isVideoSource("youtube.com/@BBCSport")).toBe(true);
    expect(isVideoSource("bbc.co.uk")).toBe(false);
  });
  it("keeps videos about the topic; a topic's own channel counts in full", () => {
    const v = parseVideoFeed(FEED);
    expect(relevantVideos(v, "Manchester United").map(x => x.id)).toEqual(["AAAAAAAAAAA"]);
    expect(relevantVideos(v, "Tennis").map(x => x.id)).toEqual(["BBBBBBBBBBB"]);
    expect(relevantVideos(v.map(x => ({ ...x, channel: "Manchester United" })), "Manchester United")).toHaveLength(2);
    expect(relevantVideos(v, "Manchester United", [{ type: "word", value: "arsenal" } as never])).toHaveLength(0);
  });
  it("starts topics with fitting channels", () => {
    expect(defaultChannels("Premier League")).toContain("youtube.com/@SkySportsFootball");
    expect(defaultChannels("Formula 1")).toContain("youtube.com/@Formula1");
    expect(defaultChannels("Gardening")).toContain("youtube.com/@BBCNews");
  });
  it("finds the outlet's favicon, never Google News's", () => {
    expect(faviconFor("https://www.bbc.co.uk")).toBe("https://www.google.com/s2/favicons?domain=bbc.co.uk&sz=64");
    expect(faviconFor("https://news.google.com/rss/articles/x")).toBeNull();
    expect(faviconFor(undefined)).toBeNull();
  });
});

import { toLanguagePicks, languageFilmPrompt } from "./practice-ai";
describe("films for languages you're learning", () => {
  it("keeps real titles in the languages you asked for, a few each", () => {
    const raw = [
      { lang: "French", title: "Le Petit Nicolas", kind: "film", year: "2009", level: "beginner", why: "Simple everyday French.", tip: "French subtitles on.", url: "https://en.wikipedia.org/wiki/Le_Petit_Nicolas_(film)" },
      { lang: "french", title: "Dix pour cent", kind: "series", level: "intermediate", why: "x", url: "https://example.org/a" },
      { lang: "Spanish", title: "La casa de papel", url: "https://example.org/b" },
      { lang: "French", title: "No link", url: "http://insecure" },
      { lang: "French", title: "A", url: "https://example.org/c" },
      { lang: "French", title: "Too many", url: "https://example.org/d" },
    ];
    const picks = toLanguagePicks(raw, ["French"], 3);
    expect(picks.map(p => p.title)).toEqual(["Le Petit Nicolas", "Dix pour cent", "A"]);
    expect(picks[0]).toMatchObject({ lang: "French", level: "beginner", tip: "French subtitles on.", kind: "film", area: "French" });
  });
  it("asks for shows made in the language, at the learner's level", () => {
    const p = languageFilmPrompt([{ name: "Yoruba", level: "beginner" }], ["Old film"]);
    expect(p).toContain("Yoruba (level: beginner)");
    expect(p).toContain("originally made in that language");
    expect(p).toContain("Don't suggest: Old film");
  });
});

import { enrichPicks } from "./practice-ai";
describe("film pictures and free-to-watch first", () => {
  const base = { why: "", kind: "film" as const };
  it("checks links, adds a picture and puts free ones first", async () => {
    const picks = [
      { ...base, id: "a", title: "Paid film", url: "https://en.wikipedia.org/wiki/A", trailer: "https://www.youtube.com/watch?v=AAAAAAAAAAA", free: false },
      { ...base, id: "b", title: "Free film", url: "https://en.wikipedia.org/wiki/B", watch: "https://www.youtube.com/watch?v=BBBBBBBBBBB", free: true },
      { ...base, id: "c", title: "Bad links", url: "https://en.wikipedia.org/wiki/C", watch: "https://example.org/gone", free: true, trailer: "https://www.youtube.com/watch?v=CCCCCCCCCCC" },
    ];
    const known: Record<string, { url: string; thumb?: string } | null> = {
      "https://www.youtube.com/watch?v=AAAAAAAAAAA": { url: "x", thumb: "https://i.ytimg.com/vi/AAAAAAAAAAA/hqdefault.jpg" },
      "https://www.youtube.com/watch?v=BBBBBBBBBBB": { url: "x", thumb: "https://i.ytimg.com/vi/BBBBBBBBBBB/hqdefault.jpg" },
      "https://example.org/gone": null, "https://www.youtube.com/watch?v=CCCCCCCCCCC": null,
      "https://en.wikipedia.org/wiki/C": { url: "x", thumb: "https://upload.wikimedia.org/poster.jpg" },
    };
    const out = await enrichPicks(picks, async urls => urls.map(u => known[u] ?? null));
    expect(out.map(p => p.id)).toEqual(["b", "a", "c"]);
    expect(out[0]).toMatchObject({ free: true, thumb: "https://i.ytimg.com/vi/BBBBBBBBBBB/hqdefault.jpg" });
    expect(out[1]).toMatchObject({ free: false, trailer: "https://www.youtube.com/watch?v=AAAAAAAAAAA", thumb: "https://i.ytimg.com/vi/AAAAAAAAAAA/hqdefault.jpg" });
    expect(out[2]).toMatchObject({ free: false, watch: undefined, trailer: undefined, thumb: "https://upload.wikimedia.org/poster.jpg" });
  });
  it("keeps the picks if checking fails", async () => {
    const p = [{ ...base, id: "a", title: "A", url: "https://x.org" }];
    expect(await enrichPicks(p, async () => { throw new Error("offline"); })).toEqual(p);
  });
});
