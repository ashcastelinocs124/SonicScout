import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/agents/llm.js", () => ({
  callLLM: vi.fn(async () => "answer about token [verified]\n  ↳ Source: stored ctx"),
}));

const llmMod = (await import("../../src/agents/llm.js")) as any;
const { answerFollowup } = await import("../../src/agents/followup.js");

const baseMemo = {
  recommendation: "Watch" as const,
  thesis: ["a","b","c"], risks: ["x","y","z"],
  sections: {
    market: "MARKET-CTX",
    founder: "FOUNDER-CTX",
    product: "PRODUCT-CTX",
    tokenomics: "TOKEN-CTX team alloc 28%",
    risk: "RISK-CTX",
  },
};

describe("answerFollowup", () => {
  beforeEach(() => llmMod.callLLM.mockClear());

  it("routes a token-related question to tokenomics context", async () => {
    const out = await answerFollowup({
      question: "what would change your mind on the token?",
      memoJson: baseMemo,
    });
    expect(out).toContain("answer about token");
    expect(llmMod.callLLM.mock.calls[0][0].user).toContain("TOKEN-CTX");
  });

  it("routes founder questions to founder context", async () => {
    await answerFollowup({ question: "tell me about the CEO", memoJson: baseMemo });
    expect(llmMod.callLLM.mock.calls[0][0].user).toContain("FOUNDER-CTX");
  });

  it("falls back to product context for unrouted questions", async () => {
    await answerFollowup({ question: "what is this", memoJson: baseMemo });
    expect(llmMod.callLLM.mock.calls[0][0].user).toContain("PRODUCT-CTX");
  });
});
