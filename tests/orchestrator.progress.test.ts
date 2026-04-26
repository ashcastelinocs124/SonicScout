import { describe, it, expect, vi } from "vitest";
import path from "node:path";

vi.mock("../src/agents/llm.js", () => ({
  callLLM: vi.fn(async ({ user }: { user: string }) => {
    if (user.includes("Output only the JSON")) {
      return JSON.stringify({
        recommendation: "Watch", thesis: ["a","b","c"], risks: ["x","y","z"], sections: {},
      });
    }
    return "ok [verified]\n  ↳ Source: x";
  }),
}));

const { runOrchestrator } = await import("../src/orchestrator/run.js");

describe("orchestrator progress callbacks", () => {
  it("fires ingestion -> 5 specialists -> memo in order with monotonic counts", async () => {
    const events: Array<{ phase: string; done: number; total: number }> = [];
    const memo = await runOrchestrator({
      websitePath: path.resolve("tests/fixtures/synapse-site.html"),
      onProgress: async (phase, done, total) => { events.push({ phase, done, total }); },
    });
    expect(memo.recommendation).toBe("Watch");

    // First event is ingestion
    expect(events[0]).toEqual({ phase: "ingestion", done: 1, total: 1 });
    // Last event is memo
    expect(events[events.length - 1]).toEqual({ phase: "memo", done: 1, total: 1 });
    // Middle events: 5 specialist completions, monotonic done: 1..5
    const specialistEvents = events.slice(1, -1);
    expect(specialistEvents).toHaveLength(5);
    expect(specialistEvents.map(e => e.done)).toEqual([1, 2, 3, 4, 5]);
    expect(specialistEvents.every(e => e.total === 5)).toBe(true);
    const phases = new Set(specialistEvents.map(e => e.phase));
    expect(phases).toEqual(new Set(["market", "founder", "product", "tokenomics", "risk"]));
  });

  it("works without onProgress callback", async () => {
    const memo = await runOrchestrator({
      websitePath: path.resolve("tests/fixtures/synapse-site.html"),
    });
    expect(memo.recommendation).toBe("Watch");
  });
});
