import { beforeEach, describe, expect, it } from "vitest";
import { AiError, aiProblem, generate, MODELS, pickModels, readRateLimit, resetModelSkips } from "./gemini";

// The order Lumen tries them in (Flash-Lite first): see pickModels.
const ORDER = ["gemini-flash-lite-latest", "gemini-flash-latest", "gemini-9-flash"];

const ok = (text = "hello") => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }));
const limited = (quotaId: string, message = "Quota exceeded", retry?: string) => new Response(JSON.stringify({ error: { code: 429, message, details: [
  { "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaId, quotaMetric: "generativelanguage.googleapis.com/generate_content_free_tier_requests" }] },
  ...(retry ? [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: retry }] : []),
] } }), { status: 429 });

/** A fake Google: answers each call with the next reply, and records which model was asked and whether search was on. */
const LISTED = ["gemini-flash-latest", "gemini-flash-lite-latest", "gemini-9-flash"];
function fake(replies: (() => Response)[], listed: string[] | null = LISTED) {
  const calls: { model: string; search: boolean }[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    if (url.includes("/models?")) return listed ? new Response(JSON.stringify({ models: listed.map(n => ({ name: "models/" + n, supportedGenerationMethods: ["generateContent"] })) })) : new Response("{}", { status: 500 });
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
    expect(f.calls.map(c => c.model)).toEqual([ORDER[0], ORDER[0]]);
    expect(waits).toEqual([3000]);
  });
  it("moves to the next free model when one is used up or not offered", async () => {
    const f = fake([() => limited("GenerateRequestsPerDayPerProjectPerModel-FreeTier", "limit: 0"), () => limited("GenerateRequestsPerDayPerProjectPerModel-FreeTier"), () => ok("from model 3")]);
    expect(await generate("k", "hi", { fetcher: f.fetcher, wait })).toBe("from model 3");
    expect(f.calls.map(c => c.model)).toEqual(ORDER);
    // and remembers, so the next call starts at the model that worked
    const g = fake([() => ok()]);
    await generate("k", "hi", { fetcher: g.fetcher, wait });
    expect(g.calls[0].model).toBe(ORDER[2]);
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
  it("says plainly when Google gives the key no free requests at all", async () => {
    const f = fake([() => limited("GenerateRequestsPerDayPerProjectPerModel-FreeTier", "Quota exceeded ... limit: 0, model: gemini-flash")]);
    const e = await generate("k", "hi", { fetcher: f.fetcher, wait }).catch(x => x);
    expect(e).toBeInstanceOf(AiError); expect(e.reason).toBe("no_free");
    expect(aiProblem(e)).toContain("any free requests"); expect(aiProblem(e)).toContain("limit: 0");
  });
  it("uses the fallback models if Google's list can't be read", async () => {
    const f = fake([() => ok()], null);
    await generate("k", "hi", { fetcher: f.fetcher, wait });
    expect(f.calls[0].model).toBe(MODELS[0]);
  });
});

describe("choosing models from Google's list", () => {
  it("keeps text models, Flash-Lite first (biggest free allowance), Gemma last, and drops special-purpose ones", () => {
    const m = (name: string, methods = ["generateContent"]) => ({ name: "models/" + name, supportedGenerationMethods: methods });
    expect(pickModels([
      m("gemini-2.5-flash"), m("gemini-3.5-flash"), m("gemini-flash-latest"), m("gemini-3.5-flash-lite"), m("gemini-flash-lite-latest"),
      m("gemini-3.5-flash-image"), m("gemini-3.5-flash-preview-tts"), m("gemini-3.5-pro"), m("text-embedding-005", ["embedContent"]),
      m("gemini-4-flash-preview"), m("gemma-4-31b-it"), m("gemini-3.5-transcribe"),
    ])).toEqual(["gemini-flash-lite-latest", "gemini-3.5-flash-lite", "gemini-flash-latest", "gemini-3.5-flash", "gemini-2.5-flash", "gemini-4-flash-preview", "gemma-4-31b-it"]);
  });
});

describe("Google Search on free keys", () => {
  const billing = () => limited("", "You exceeded your current quota, please check your plan and billing details.");
  it("asks the same model again without search when search is refused", async () => {
    const f = fake([billing, () => ok("picks")]);
    expect(await generate("k", "hi", { fetcher: f.fetcher, wait, search: true })).toBe("picks");
    expect(f.calls).toEqual([{ model: ORDER[0], search: true }, { model: ORDER[0], search: false }]);
    // and doesn't ask for search again for a while
    const g = fake([() => ok()]);
    await generate("k", "hi", { fetcher: g.fetcher, wait, search: true });
    expect(g.calls[0].search).toBe(false);
  });
  it("for live news, tries Gemini 2.x first (free search) and never answers without search", async () => {
    const f = fake([() => ok("news")], ["gemini-flash-lite-latest", "gemini-3.5-flash", "gemini-2.5-flash"]);
    await generate("k", "hi", { fetcher: f.fetcher, wait, requireSearch: true });
    expect(f.calls[0]).toEqual({ model: "gemini-2.5-flash", search: true });
    resetModelSkips();
    const g = fake([billing], ["gemini-flash-lite-latest", "gemini-3.5-flash"]);
    const e = await generate("k", "hi", { fetcher: g.fetcher, wait, requireSearch: true }).catch(x => x);
    expect(e.reason).toBe("no_search");
    expect(g.calls.every(c => c.search)).toBe(true);
  });
});
