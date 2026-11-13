import { beforeEach, describe, expect, it } from "vitest";
import { generate, MODELS, readRateLimit, resetModelSkips } from "./gemini";

const ok = (text = "hello") => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }));
const limited = (quotaId: string, message = "Quota exceeded", retry?: string) => new Response(JSON.stringify({ error: { code: 429, message, details: [
  { "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaId, quotaMetric: "generativelanguage.googleapis.com/generate_content_free_tier_requests" }] },
  ...(retry ? [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: retry }] : []),
] } }), { status: 429 });

/** A fake Google: answers each call with the next reply, and records which model was asked and whether search was on. */
function fake(replies: (() => Response)[]) {
  const calls: { model: string; search: boolean }[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    calls.push({ model: url.split("/models/")[1].split(":")[0], search: !!JSON.parse(String(init.body)).tools });
    return (replies[calls.length - 1] ?? replies[replies.length - 1])();
  }) as unknown as typeof fetch;
  return { fetcher, calls };
}
const waits: number[] = [];
const wait = async (ms: number) => { waits.push(ms); };

beforeEach(() => { resetModelSkips(); waits.length = 0; });

describe("reading Google's 429s", () => {
  it("tells the kinds apart", async () => {
    const kind = async (r: Response) => readRateLimit(await r.json()).kind;
    expect(await kind(limited("GenerateRequestsPerMinutePerProjectPerModel-FreeTier", "x", "17s"))).toBe("minute");
    expect(await kind(limited("GenerateRequestsPerDayPerProjectPerModel-FreeTier"))).toBe("day");
    expect(await kind(limited("GenerateRequestsPerDayPerProjectPerModel-FreeTier", "Quota exceeded for metric ... limit: 0, model: x"))).toBe("unavailable");
    expect(await kind(limited("SearchGroundingRequestsPerDay-FreeTier"))).toBe("search");
    expect(readRateLimit((await limited("PerMinute", "x", "17.5s").json())).retryMs).toBe(17500);
  });
});

describe("asking Gemini when it's busy or limited", () => {
  it("waits out a per-minute limit and retries the same model", async () => {
    const f = fake([() => limited("GenerateRequestsPerMinutePerProjectPerModel-FreeTier", "x", "3s"), () => ok("done")]);
    expect(await generate("k", "hi", { fetcher: f.fetcher, wait })).toBe("done");
    expect(f.calls.map(c => c.model)).toEqual([MODELS[0], MODELS[0]]);
    expect(waits).toEqual([3000]);
  });
  it("moves to the next free model when one is used up or not offered", async () => {
    const f = fake([() => limited("GenerateRequestsPerDayPerProjectPerModel-FreeTier", "limit: 0"), () => limited("GenerateRequestsPerDayPerProjectPerModel-FreeTier"), () => ok("from model 3")]);
    expect(await generate("k", "hi", { fetcher: f.fetcher, wait })).toBe("from model 3");
    expect(f.calls.map(c => c.model)).toEqual(MODELS.slice(0, 3));
    // and remembers, so the next call starts at the model that worked
    const g = fake([() => ok()]);
    await generate("k", "hi", { fetcher: g.fetcher, wait });
    expect(g.calls[0].model).toBe(MODELS[2]);
  });
  it("answers without live search when only search is limited", async () => {
    const f = fake([() => limited("SearchGroundingRequestsPerDay-FreeTier"), () => ok("no search")]);
    expect(await generate("k", "hi", { fetcher: f.fetcher, wait, search: true })).toBe("no search");
    expect(f.calls.map(c => c.search)).toEqual([true, false]);
  });
  it("skips models Google no longer offers", async () => {
    const f = fake([() => new Response("{}", { status: 404 }), () => ok("next")]);
    expect(await generate("k", "hi", { fetcher: f.fetcher, wait })).toBe("next");
  });
  it("says 'busy' if every model is only limited per minute, and 'quota' if all are used up for the day", async () => {
    await expect(generate("k", "hi", { fetcher: fake([() => limited("PerMinute", "x", "1s")]).fetcher, wait })).rejects.toMatchObject({ reason: "busy" });
    resetModelSkips();
    await expect(generate("k", "hi", { fetcher: fake([() => limited("PerDay")]).fetcher, wait })).rejects.toMatchObject({ reason: "quota" });
  });
});
