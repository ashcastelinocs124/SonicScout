import { describe, it, expect, beforeEach } from "vitest";
import { Store } from "../src/db/store.js";

describe("store", () => {
  let s: Store;
  beforeEach(() => { s = new Store(":memory:"); });

  it("creates a run and reads it back by thread ts", () => {
    const id = s.createRun({
      slackChannel: "C1", slackUser: "U1", slackThreadTs: "1234.5",
      inputPayload: { url: "https://x.com" },
    });
    const r = s.findByThread("1234.5");
    expect(r?.id).toBe(id);
    expect(r?.inputPayload.url).toBe("https://x.com");
  });

  it("completes a run with memo JSON", () => {
    const id = s.createRun({ slackChannel: "C1", slackUser: "U1", inputPayload: {} });
    s.completeRun(id, { recommendation: "Pass", memoJson: { foo: 1 }, ingestedContext: {}, thesisSnapshot: "x" });
    const r = s.find(id);
    expect(r?.status).toBe("completed");
    expect(r?.recommendation).toBe("Pass");
    expect(r?.memoJson.foo).toBe(1);
  });
});
