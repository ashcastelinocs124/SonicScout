import { describe, it, expect, vi } from "vitest";
import path from "node:path";

vi.mock("../src/agents/llm.js", () => ({
  callLLMWithSearch: vi.fn(async () => ({ text: "", citationHosts: new Set<string>() })),
  callLLM: vi.fn(async ({ user }: { user: string }) => {
    if (user.includes("Output only the JSON")) {
      return JSON.stringify({
        recommendation: "Take Meeting",
        thesis: ["AI x crypto rails fit", "tech founder", "token has clear utility"],
        risks: ["solo CEO", "no traction", "crowded category"],
        sections: {},
      });
    }
    return `Synapse Protocol [verified]\n  ↳ Source: tests/fixtures/synapse-site.html`;
  }),
}));

const { runOrchestrator } = await import("../src/orchestrator/run.js");

describe("e2e: synapse fixture", () => {
  it("produces a valid memo end-to-end with deck + site", async () => {
    const memo = await runOrchestrator({
      websitePath: path.resolve("tests/fixtures/synapse-site.html"),
      deckPath: path.resolve("tests/fixtures/synapse-deck.pdf"),
    });
    expect(memo.recommendation).toBe("Take Meeting");
    expect(memo.thesis).toHaveLength(3);
    expect(memo.risks).toHaveLength(3);
    expect(memo.sections.market).toMatch(/Synapse|verified/);
    // Confirm tier post-processor preserves verified claim with source line
    expect(memo.sections.market).toContain("[verified]");
    expect(memo.sections.market).toContain("Source:");
  });

  it("produces a valid memo end-to-end with site only (no deck)", async () => {
    const memo = await runOrchestrator({
      websitePath: path.resolve("tests/fixtures/synapse-site.html"),
    });
    expect(memo.recommendation).toBe("Take Meeting");
  });
});
