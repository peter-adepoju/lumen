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
