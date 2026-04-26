import { describe, it, expect, vi } from "vitest";

vi.mock("../src/orchestrator/run.js", () => ({
  runOrchestrator: vi.fn(async () => ({
    recommendation: "Watch",
    thesis: ["a","b","c"], risks: ["x","y","z"], sections: {},
  })),
}));

const { processJob } = await import("../src/queue/worker.js");

describe("worker.processJob", () => {
  it("calls orchestrator and returns memo", async () => {
    const memo = await processJob({ websitePath: "tests/fixtures/synapse-site.html" });
    expect(memo.recommendation).toBe("Watch");
    expect(memo.thesis).toHaveLength(3);
  });
});
