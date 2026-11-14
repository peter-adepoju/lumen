import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { feedDates, oldestFirst, pageJson, readHeader, readVideos, relativeDate } from "./server/playlist";
import { mergeEpisodes, nextEpisode, resumeAt } from "./playlist";

const NOW = Date.parse("2026-11-14T12:00:00Z");
const pv = (id: string, title: string, ago: string) => ({ playlistVideoRenderer: { videoId: id, title: { runs: [{ text: title }] }, lengthSeconds: "1800", videoInfo: { runs: [{ text: "1.2K views" }, { text: " • " }, { text: ago }] } } });
// A playlist page in YouTube's format, newest episode first, with a "more" token.
const DATA = {
  metadata: { playlistMetadataRenderer: { title: "LIT EPISODES" } },
  header: { playlistHeaderRenderer: { ownerText: { runs: [{ text: "P.Daniel Olawande" }] } } },
  contents: { twoColumnBrowseResultsRenderer: { tabs: [{ tabRenderer: { content: { sectionListRenderer: { contents: [{ itemSectionRenderer: { contents: [{ playlistVideoListRenderer: { contents: [
    pv("CCCCCCCCCCC", "Episode 3", "2 days ago"), pv("BBBBBBBBBBB", "Episode 2", "1 month ago"), pv("AAAAAAAAAAA", "Episode 1", "1 year ago"),
    pv("PPPPPPPPPPP", "[Private video]", ""),
    { continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token: "TOKEN123" } } } },
  ] } }] } }] } } } }] } },
};

describe("reading a playlist", () => {
  it("finds the page data, the videos, the next page and the header", () => {
    const html = `<script>var ytInitialData = ${JSON.stringify(DATA)};</script>`;
    const data = pageJson(html, "ytInitialData")!;
    const { videos, next } = readVideos(data, NOW);
    expect(videos.map(v => v.id)).toEqual(["CCCCCCCCCCC", "BBBBBBBBBBB", "AAAAAAAAAAA"]);
    expect(videos[0]).toMatchObject({ title: "Episode 3", seconds: 1800, approx: true });
    expect(next).toBe("TOKEN123");
    expect(readHeader(data as Record<string, unknown>)).toEqual({ title: "LIT EPISODES", channel: "P.Daniel Olawande" });
  });
  it("reads the newer page layout too", () => {
    const lockup = { lockupViewModel: { contentId: "DDDDDDDDDDD", metadata: { lockupMetadataViewModel: { title: { content: "Episode 4" }, metadata: { contentMetadataViewModel: { metadataRows: [{ metadataParts: [{ text: { content: "3 hours ago" } }] }] } } } } } };
    expect(readVideos({ x: [lockup] }, NOW).videos[0]).toMatchObject({ id: "DDDDDDDDDDD", title: "Episode 4" });
  });
  it("turns a newest-first playlist round, and leaves an oldest-first one alone", () => {
    const { videos } = readVideos(DATA, NOW);
    expect(oldestFirst(videos).map(v => v.title)).toEqual(["Episode 1", "Episode 2", "Episode 3"]);
    expect(oldestFirst([...videos].reverse()).map(v => v.title)).toEqual(["Episode 1", "Episode 2", "Episode 3"]);
  });
  it("reads ages and exact feed dates", () => {
    expect(relativeDate("Streamed 2 weeks ago", NOW)).toBe(new Date(NOW - 14 * 864e5).toISOString());
    expect(relativeDate("no date")).toBeUndefined();
    expect(feedDates("<entry><yt:videoId>AAAAAAAAAAA</yt:videoId><published>2025-01-02T10:00:00+00:00</published></entry>").get("AAAAAAAAAAA")).toBe("2025-01-02T10:00:00.000Z");
  });
});

describe("following a playlist", () => {
  const ep = (id: string) => ({ id, title: id });
  it("marks episodes added since last time as new (not on the first look)", () => {
    expect(mergeEpisodes(undefined, [ep("a"), ep("b")]).newIds).toEqual([]);
    const m = mergeEpisodes([ep("a"), ep("b")], [ep("a"), ep("b"), ep("c")], ["b"]);
    expect(m.added).toEqual(["c"]);
    expect(m.newIds).toEqual(["b", "c"]);
  });
  it("carries on from the episode you were on, even after new ones arrive", () => {
    const order = [ep("a"), ep("b"), ep("c")];
    expect(resumeAt(order, { video: "b", seconds: 300, at: 0 })).toEqual({ index: 1, seconds: 297 });
    expect(resumeAt([ep("z"), ...order], { video: "b", seconds: 300, at: 0 }).index).toBe(2);
    expect(resumeAt(order, undefined)).toEqual({ index: 0, seconds: 0 });
    expect(nextEpisode(order, 0, new Set(["b"]))).toBe(2);
    expect(nextEpisode(order, 2, new Set())).toBeNull();
  });
});
