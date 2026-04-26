import { describe, it, expect, vi } from "vitest";

vi.mock("../../src/agents/llm.js", () => ({
  callLLM: vi.fn(async () => JSON.stringify({
    recommendation: "Take Meeting",
    thesis: ["fits AI x crypto rails", "strong technical founder", "token has clear utility"],
    risks: ["solo CEO", "early traction", "crowded market"],
    sections: { market: "...", founder: "...", product: "...", tokenomics: "...", risk: "..." },
  })),
}));

const { runMemo } = await import("../../src/agents/memo.js");
const { loadThesis } = await import("../../src/agents/thesis.js");

describe("memo synthesis", () => {
  it("returns a valid Memo with recommendation and 3+3 bullets", async () => {
    const thesis = await loadThesis();
    const memo = await runMemo({
      sections: { market: "m", founder: "f", product: "p", tokenomics: "t", risk: "r" },
      thesis,
    });
    expect(memo.recommendation).toBe("Take Meeting");
    expect(memo.thesis).toHaveLength(3);
    expect(memo.risks).toHaveLength(3);
    // Sections are forced to verbatim specialist outputs (overriding LLM's echo).
    expect(memo.sections.market).toBe("m");
    expect(memo.sections.founder).toBe("f");
  });
});
