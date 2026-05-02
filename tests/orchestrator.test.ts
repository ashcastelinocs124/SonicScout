import { describe, it, expect, vi } from "vitest";
import path from "node:path";

vi.mock("../src/agents/llm.js", () => ({
  callLLMWithSearch: vi.fn(async () => ({ text: "", citationHosts: new Set<string>() })),
  callLLM: vi.fn(async ({ user }: { user: string }) => {
    if (user.includes("Output only the JSON")) {
      return JSON.stringify({
        recommendation: "Take Meeting",
        thesis: ["a", "b", "c"],
        risks: ["x", "y", "z"],
        sections: {},
      });
    }
    return "agent-output [verified]\n  ↳ Source: https://example.com";
  }),
}));

const { runOrchestrator } = await import("../src/orchestrator/run.js");

describe("orchestrator", () => {
  it("runs ingestion → 5 specialists in parallel → memo", async () => {
    const memo = await runOrchestrator({
      websitePath: path.resolve("tests/fixtures/synapse-site.html"),
    });
    expect(memo.recommendation).toBe("Take Meeting");
    expect(memo.sections.market).toContain("agent-output");
    expect(memo.sections.founder).toContain("agent-output");
    expect(memo.sections.product).toContain("agent-output");
    expect(memo.sections.tokenomics).toContain("agent-output");
    expect(memo.sections.risk).toContain("agent-output");
  });
});
