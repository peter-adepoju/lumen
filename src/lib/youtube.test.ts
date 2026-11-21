import { describe, expect, it } from "vitest";
import { newLikes, toChannels, toVideos } from "./youtube";
import type { YouTubeState } from "./model";

describe("youtube", () => {
  it("reads subscriptions, dropping broken ones", () => {
    const subs = toChannels([
      { snippet: { title: "Veritasium", resourceId: { channelId: "UC1" }, thumbnails: { default: { url: "d.jpg" }, medium: { url: "m.jpg" } } } },
      { snippet: { title: "No id" } }, // dropped: no channel id
    ]);
    expect(subs).toEqual([{ id: "UC1", title: "Veritasium", thumb: "m.jpg", url: "https://www.youtube.com/channel/UC1" }]);
  });

  it("reads liked videos", () => {
    const likes = toVideos([
      { id: "vid1", snippet: { title: "How planes fly", channelTitle: "Real Engineering", thumbnails: { default: { url: "d.jpg" } } } },
      { snippet: { title: "No id" } }, // dropped
    ]);
    expect(likes).toEqual([{ id: "vid1", title: "How planes fly", channel: "Real Engineering", thumb: "d.jpg", url: "https://www.youtube.com/watch?v=vid1" }]);
  });

  it("finds only the likes that are new since last sync", () => {
    const prev: YouTubeState = { connectedAt: 1, syncedAt: 1, subs: [], likes: [{ id: "a", title: "A", channel: "c", url: "u" }] };
    const next: YouTubeState = { connectedAt: 1, syncedAt: 2, subs: [], likes: [{ id: "a", title: "A", channel: "c", url: "u" }, { id: "b", title: "B", channel: "c", url: "u" }] };
    expect(newLikes(prev, next).map(v => v.id)).toEqual(["b"]);
    expect(newLikes(undefined, next).map(v => v.id)).toEqual(["a", "b"]);
  });
});
