import { describe, expect, it } from "vitest";
import { joinChoice, wrap } from "./merge";

describe("a new device joining an account's Drive", () => {
  const drive = wrap({ areas: ["French", "Writing"] }, 1000);   // set up on the PC earlier
  const phone = wrap({ areas: ["Chess"] }, 5000);               // a newer setup made on the phone
  it("keeps the account's setup from Drive, even if the device's copy is newer", () => {
    expect(joinChoice(true, phone, drive)).toBe("take-remote");
  });
  it("uploads setup that only exists on the device", () => {
    expect(joinChoice(true, phone, null)).toBe("upload");
  });
  it("lets the newer copy win for everything else", () => {
    expect(joinChoice(false, wrap("stats", 5000), wrap("stats", 1000))).toBe("upload");
    expect(joinChoice(false, wrap("stats", 1000), wrap("stats", 5000))).toBe("take-remote");
    expect(joinChoice(false, wrap("same", 1000), wrap("same", 1000))).toBe("keep");
    expect(joinChoice(false, null, wrap("from PC", 1000))).toBe("take-remote");
    expect(joinChoice(false, null, null)).toBe("keep");
  });
});
