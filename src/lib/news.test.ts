import { describe, expect, it } from "vitest";
import { cleanHeadlines, newsQuery, parseFeed, siteSources } from "./server/news";
import { rankPrompt, toStories, withoutBlocked } from "./news";

// A made-up feed in Google News's RSS format.
const FEED = `<?xml version="1.0"?><rss><channel>
<item><title>Club names new head coach - Example Sport</title><link>https://news.google.com/rss/articles/AAA?oc=5</link><pubDate>Fri, 13 Nov 2026 08:00:00 GMT</pubDate><source url="https://www.examplesport.co.uk">Example Sport</source></item>
<item><title><![CDATA[Club names new head coach &amp; staff - Other Paper]]></title><link>https://news.google.com/rss/articles/BBB?oc=5</link><pubDate>Fri, 13 Nov 2026 07:00:00 GMT</pubDate><source url="https://otherpaper.com">Other Paper</source></item>
<item><title>Striker linked with January move - Gossip Daily</title><link>https://news.google.com/rss/articles/CCC?oc=5</link><pubDate>Thu, 12 Nov 2026 20:00:00 GMT</pubDate><source url="https://gossipdaily.net">Gossip Daily</source></item>
<item><title>Weekend fixture preview - Official Club</title><link>https://news.google.com/rss/articles/DDD?oc=5</link><pubDate>Fri, 13 Nov 2026 09:00:00 GMT</pubDate><source url="https://www.officialclub.com">Official Club</source></item>
<item><title>Club names new head coach - Example Sport</title><link>https://news.google.com/rss/articles/EEE?oc=5</link><source url="https://www.examplesport.co.uk">Example Sport</source></item>
<item><title>Broken item</title><link>http://insecure.example</link></item>
</channel></rss>`;

describe("live headlines from Google News", () => {
  it("reads titles, outlets, links and times", () => {
    const items = parseFeed(FEED);
    expect(items).toHaveLength(5);
    expect(items[0]).toEqual({ title: "Club names new head coach", url: "https://news.google.com/rss/articles/AAA?oc=5", source: "Example Sport", sourceUrl: "https://www.examplesport.co.uk", date: "2026-11-13T08:00:00.000Z" });
    expect(items[1].title).toBe("Club names new head coach & staff");
  });
  it("searches the topic from the last two days, on your trusted sites only", () => {
    expect(newsQuery("Manchester United", [])).toBe('"Manchester United" when:2d');
    expect(newsQuery("Manchester United", ["https://www.manutd.com/en", "bbc.co.uk", "x.com/ManUtd"])).toBe('"Manchester United" when:2d (site:manutd.com OR site:bbc.co.uk)');
    expect(siteSources(["x.com/ManUtd", "twitter.com/x"])).toEqual([]);
  });
  it("keeps only trusted outlets, drops repeats, newest first", () => {
    const all = cleanHeadlines(parseFeed(FEED), []);
    expect(all.map(h => h.title)).toEqual(["Weekend fixture preview", "Club names new head coach", "Club names new head coach & staff", "Striker linked with January move"]);
    expect(cleanHeadlines(parseFeed(FEED), ["officialclub.com", "examplesport.co.uk"]).map(h => h.source)).toEqual(["Official Club", "Example Sport"]);
  });
});

describe("the brief", () => {
  const items = cleanHeadlines(parseFeed(FEED), []);
  it("drops what you've blocked", () => {
    expect(withoutBlocked(items, [{ type: "topic", value: "linked with", at: 1 }, { type: "creator", value: "Other Paper", at: 1 }]).map(h => h.source)).toEqual(["Official Club", "Example Sport"]);
  });
  it("asks the AI to choose from the real headlines only", () => {
    const p = rankPrompt("Manchester United", items);
    expect(p).toContain("0. Weekend fixture preview (Official Club, 2026-11-13)");
    expect(p).toContain('"i": 0');
  });
  it("keeps each story's real link and outlet, and ignores bad picks", () => {
    const s = toStories([{ i: 1, status: "Confirmed" }, { i: 99 }, { i: 3, status: "Rumour" }, { i: 1, status: "Reported" }, { i: 0, status: "Made up" }], items, "mu");
    expect(s.map(x => [x.title, x.status, x.source])).toEqual([["Club names new head coach", "Confirmed", "Example Sport"], ["Striker linked with January move", "Rumour", "Gossip Daily"], ["Weekend fixture preview", "Reported", "Official Club"]]);
    expect(s[0].url).toBe(items[1].url);
  });
  it("without the AI, shows the newest headlines", () => {
    expect(toStories(null, items, "mu").map(x => x.title)).toEqual(items.map(h => h.title));
  });
});

import { markFresh } from "./news";
describe("refreshing the news", () => {
  const story = (id: string, title: string) => ({ id, topic: "mu", title, summary: "", status: "Reported" as const, source: "S", url: "https://x/" + id });
  it("marks only stories you didn't have before", () => {
    const before = [story("a", "Club names new head coach"), story("b", "Weekend fixture preview")];
    const next = [story("c", "Club names new head coach!"), story("b", "Weekend fixture preview"), story("d", "Captain signs new deal")];
    expect(markFresh(next, before).map(n => [n.id, n.fresh])).toEqual([["c", false], ["b", false], ["d", true]]);
  });
  it("marks nothing on the first brief of the day", () => {
    expect(markFresh([story("a", "One")], undefined)[0].fresh).toBeUndefined();
  });
});
