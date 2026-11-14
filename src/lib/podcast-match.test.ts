import { describe, expect, it } from "vitest";
import { pairEpisodes, parsePodcastFeed, showScore, titleScore, titleWords } from "./podcast-match";

const FEED = `<rss><channel><title>LIT Podcast</title>
<item><title>LIT Episode 1: 12 Stones to Rebuild Your Altar</title><enclosure url="https://cdn.example.com/lit1.mp3" type="audio/mpeg" length="1"/><pubDate>Mon, 03 Aug 2026 06:00:00 GMT</pubDate><itunes:duration>40:12</itunes:duration><guid>lit-1</guid></item>
<item><title><![CDATA[LIT Episode 2 – The Fire Must Not Go Out]]></title><enclosure url="http://cdn.example.com/lit2.mp3?x=1&amp;y=2" type="audio/mpeg"/><itunes:duration>2460</itunes:duration></item>
<item><title>Bonus: Q&amp;A night</title><enclosure url="https://cdn.example.com/qa.mp3" type="audio/mpeg"/></item>
<item><title>Video only</title><enclosure url="https://cdn.example.com/v.mov" type="video/quicktime"/></item>
</channel></rss>`;

describe("listen instead", () => {
  it("reads a podcast feed", () => {
    const eps = parsePodcastFeed(FEED);
    expect(eps.map(e => e.title)).toEqual(["LIT Episode 1: 12 Stones to Rebuild Your Altar", "LIT Episode 2 – The Fire Must Not Go Out", "Bonus: Q&A night"]);
    expect(eps[0]).toMatchObject({ audio: "https://cdn.example.com/lit1.mp3", seconds: 2412, guid: "lit-1", date: "2026-08-03T06:00:00.000Z" });
    expect(eps[1]).toMatchObject({ audio: "https://cdn.example.com/lit2.mp3?x=1&y=2", seconds: 2460 });
  });
  it("matches video titles to episodes, never across episode numbers", () => {
    expect(titleWords("Be careful what you say to people #pastordolapolawal")).toEqual(["be", "careful", "what", "you", "say", "people"]);
    expect(titleScore("12 STONES TO REBUILD YOUR ALTAR | LIT EPISODE 1 | P.Daniel", "LIT Episode 1: 12 Stones to Rebuild Your Altar")).toBeGreaterThan(0.62);
    expect(titleScore("LIT Episode 2: The Fire", "LIT Episode 3: The Fire")).toBe(0);
    const eps = parsePodcastFeed(FEED);
    const m = pairEpisodes([
      { key: "AAA", title: "12 Stones To Rebuild Your Altar (LIT Episode 1)" },
      { key: "BBB", title: "THE FIRE MUST NOT GO OUT | LIT EPISODE 2" },
      { key: "CCC", title: "Sunday service highlights" },
    ], eps);
    expect(Object.keys(m)).toEqual(["AAA", "BBB"]);
    expect(m.BBB.audio).toContain("lit2.mp3");
  });
  it("only trusts a podcast that's the creator's own", () => {
    expect(showScore({ title: "LIT Podcast", author: "P. Daniel Olawande" }, "P.Daniel Olawande")).toBeGreaterThanOrEqual(0.5);
    expect(showScore({ title: "Daily Devotion", author: "Someone Else" }, "P.Daniel Olawande")).toBe(0);
  });
});
