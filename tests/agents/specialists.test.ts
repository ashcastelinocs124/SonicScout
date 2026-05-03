import { describe, it, expect, vi, beforeEach } from "vitest";
import path from "node:path";

const FIXTURE = path.resolve("tests/fixtures/thesis.md");

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

const emptyCtx = { founderProfiles: [], competitors: [], rawMetadata: {} };

describe("specialist agents", () => {
  beforeEach(() => llmMod.callLLM.mockClear());

  it("runMarket calls LLM with market thesis slice and returns processed text", async () => {
    const thesis = await loadThesis(FIXTURE);
    const out = await runMarket({ ctx: emptyCtx, thesis });
    expect(out).toContain("io.net");
    expect(out).toContain("[verified]");
    const args = llmMod.callLLM.mock.calls[0][0];
    expect(args.system).toContain("AI agents need crypto rails");
    expect(args.system).toContain("Market Map analyst");
    expect(args.model).toBe("gpt-5-mini");
  });

  it("runFounder uses founder thesis slice", async () => {
    const thesis = await loadThesis(FIXTURE);
    await runFounder({ ctx: emptyCtx, thesis });
    const args = llmMod.callLLM.mock.calls[0][0];
    expect(args.system).toContain("technical founders");
  });

  it("runProduct includes market+token thesis slices", async () => {
    const thesis = await loadThesis(FIXTURE);
    await runProduct({ ctx: emptyCtx, thesis });
    const args = llmMod.callLLM.mock.calls[0][0];
    expect(args.system).toContain("AI and blockchain are *necessary*");
  });

  it("runTokenomics uses token+anti-patterns slice", async () => {
    const thesis = await loadThesis(FIXTURE);
    await runTokenomics({ ctx: emptyCtx, thesis });
    const args = llmMod.callLLM.mock.calls[0][0];
    expect(args.system).toContain("Tokenomics analyst");
    expect(args.system).toContain("auto-flag");
  });

  it("runRisk uses anti-patterns slice and escalates HARD FLAGS", async () => {
    const thesis = await loadThesis(FIXTURE);
    await runRisk({ ctx: emptyCtx, thesis });
    const args = llmMod.callLLM.mock.calls[0][0];
    expect(args.system).toContain("HARD FLAGS");
  });

  it("includes competitors block in user prompt when present", async () => {
    const thesis = await loadThesis(FIXTURE);
    const ctx = {
      ...emptyCtx,
      competitors: [
        { name: "BCG X", positioning: "Big-3 consultancy AI practice", source: "https://www.bcg.com/x/about" },
        { name: "Accenture Song", positioning: "CX consulting arm", source: "https://newsroom.accenture.com/news/2024/song" },
      ],
    };
    await runMarket({ ctx, thesis });
    const args = llmMod.callLLM.mock.calls[0][0];
    expect(args.user).toContain("### Competitors (researched via web search)");
    expect(args.user).toContain("[BCG X] — Big-3 consultancy AI practice");
    expect(args.user).toContain("↳ Source: https://www.bcg.com/x/about");
    expect(args.user).toContain("[Accenture Song] — CX consulting arm");
    expect(args.user).toContain("↳ Source: https://newsroom.accenture.com/news/2024/song");
  });

  it("renders empty-state placeholder when competitors is empty", async () => {
    const thesis = await loadThesis(FIXTURE);
    await runMarket({ ctx: emptyCtx, thesis });
    const args = llmMod.callLLM.mock.calls[0][0];
    expect(args.user).toContain("### Competitors (researched via web search)");
    expect(args.user).toContain("(no competitor research available — use website copy and tag claims as [inferred])");
  });
});
