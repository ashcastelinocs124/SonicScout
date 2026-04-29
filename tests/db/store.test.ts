import { describe, it, expect, beforeEach } from "vitest";
import { Store } from "../../src/db/store.js";

describe("Store", () => {
  let store: Store;
  beforeEach(() => { store = new Store(":memory:"); });

  it("creates a run and finds it by id", () => {
    const id = store.createRun({ inputPayload: { url: "https://x.com" } });
    const row = store.find(id);
    expect(row?.id).toBe(id);
    expect(row?.status).toBe("pending");
    expect(row?.inputPayload).toEqual({ url: "https://x.com" });
  });

  it("completes a run and stores the memo", () => {
    const id = store.createRun({ inputPayload: { url: "https://x.com" } });
    const memo = { recommendation: "Watch", thesis: ["a","b","c"], risks: ["r1","r2","r3"], sections: { market: "..." } };
    store.completeRun(id, { recommendation: "Watch", memoJson: memo, ingestedContext: {}, thesisSnapshot: "" });
    const row = store.find(id);
    expect(row?.status).toBe("completed");
    expect(row?.memoJson).toEqual(memo);
  });

  it("returns undefined for unknown id", () => {
    expect(store.find(99999)).toBeUndefined();
  });
});
