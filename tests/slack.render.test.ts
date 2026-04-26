import { describe, it, expect } from "vitest";
import { renderParent, renderSection } from "../src/slack/render.js";

describe("slack render", () => {
  it("parent message has recommendation emoji + thesis + risks", () => {
    const blocks = renderParent({
      recommendation: "Take Meeting",
      thesis: ["a","b","c"],
      risks: ["x","y","z"],
      sections: { market:"", founder:"", product:"", tokenomics:"", risk:"" },
    });
    const text = JSON.stringify(blocks);
    expect(text).toContain("TAKE MEETING");
    expect(text).toMatch(/Thesis/i);
    expect(text).toMatch(/Risks/i);
    expect(text).toContain("🟢");
  });

  it("Pass recommendation uses red emoji", () => {
    const blocks = renderParent({
      recommendation: "Pass",
      thesis: ["a","b","c"], risks: ["x","y","z"], sections: {},
    });
    expect(JSON.stringify(blocks)).toContain("🔴");
  });

  it("section block contains agent name and content", () => {
    const blk = renderSection("Founder Signal", "Maya was at Anthropic [verified]");
    const text = JSON.stringify(blk);
    expect(text).toContain("Founder Signal");
    expect(text).toContain("Anthropic");
  });

  it("section truncates body to 2900 chars", () => {
    const long = "x".repeat(5000);
    const blk = renderSection("X", long);
    const text = (blk[1].text as any).text as string;
    expect(text.length).toBe(2900);
  });
});
