import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/agents/llm.js", () => ({
  callLLM: vi.fn(async () => "competitor: io.net [verified]\n  ↳ Source: https://io.net"),
}));

const llmMod = (await import("../../src/agents/llm.js")) as any;
const { runMarket } = await import("../../src/agents/market.js");
const { runFounder } = await import("../../src/agents/founder.js");
const { runProduct } = await import("../../src/agents/product.js");
const { runTokenomics } = await import("../../src/agents/tokenomics.js");
const { runRisk } = await import("../../src/agents/risk.js");
const { loadThesis } = await import("../../src/agents/thesis.js");

const emptyCtx = { founderProfiles: [], rawMetadata: {} };

describe("specialist agents", () => {
  beforeEach(() => llmMod.callLLM.mockClear());

  it("runMarket calls LLM with market thesis slice and returns processed text", async () => {
    const thesis = await loadThesis();
    const out = await runMarket({ ctx: emptyCtx, thesis });
    expect(out).toContain("io.net");
    expect(out).toContain("[verified]");
    const args = llmMod.callLLM.mock.calls[0][0];
    expect(args.system).toContain("AI agents need crypto rails");
    expect(args.system).toContain("Market Map analyst");
    expect(args.cacheSystem).toBe(true);
  });

  it("runFounder uses founder thesis slice", async () => {
    const thesis = await loadThesis();
    await runFounder({ ctx: emptyCtx, thesis });
    const args = llmMod.callLLM.mock.calls[0][0];
    expect(args.system).toContain("technical founders");
  });

  it("runProduct includes market+token thesis slices", async () => {
    const thesis = await loadThesis();
    await runProduct({ ctx: emptyCtx, thesis });
    const args = llmMod.callLLM.mock.calls[0][0];
    expect(args.system).toContain("AI and blockchain are *necessary*");
  });

  it("runTokenomics uses token+anti-patterns slice", async () => {
    const thesis = await loadThesis();
    await runTokenomics({ ctx: emptyCtx, thesis });
    const args = llmMod.callLLM.mock.calls[0][0];
    expect(args.system).toContain("Tokenomics analyst");
    expect(args.system).toContain("auto-flag");
  });

  it("runRisk uses anti-patterns slice and escalates HARD FLAGS", async () => {
    const thesis = await loadThesis();
    await runRisk({ ctx: emptyCtx, thesis });
    const args = llmMod.callLLM.mock.calls[0][0];
    expect(args.system).toContain("HARD FLAGS");
  });
});
