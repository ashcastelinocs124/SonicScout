import { describe, it, expect } from "vitest";
import { stripUnverified, countTiers } from "../../src/agents/tiering.js";

describe("tiering", () => {
  it("downgrades [verified] without a source to [speculative]", () => {
    const input = "Founder was at Anthropic [verified] (no source).";
    expect(stripUnverified(input)).toContain("[speculative]");
  });

  it("preserves [verified] when a URL or 'Source:' line follows", () => {
    const input = "Founder was at Anthropic [verified]\n  ↳ Source: https://linkedin.com/in/x";
    expect(stripUnverified(input)).toContain("[verified]");
  });

  it("counts tiers across a memo", () => {
    const memo = "a [verified]\nb [inferred]\nc [speculative]\nd [verified]";
    expect(countTiers(memo)).toEqual({ verified: 2, inferred: 1, speculative: 1 });
  });
});
