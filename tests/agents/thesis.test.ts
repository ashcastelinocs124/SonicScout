import { describe, it, expect } from "vitest";
import path from "node:path";
import { loadThesis, sliceThesis } from "../../src/agents/thesis.js";

const FIXTURE = path.resolve("tests/fixtures/thesis.md");

describe("thesis", () => {
  it("loads all sections", async () => {
    const t = await loadThesis(FIXTURE);
    expect(t.market).toMatch(/AI agents need crypto rails/);
    expect(t.founder).toMatch(/technical founders/);
    expect(t.token).toMatch(/coordination\/incentive/);
    expect(t.antiPatterns).toMatch(/auto-flag/);
  });

  it("slice returns relevant section for an agent", async () => {
    const t = await loadThesis(FIXTURE);
    expect(sliceThesis(t, "market")).toContain("AI agents need crypto rails");
    expect(sliceThesis(t, "founder")).toContain("technical founders");
  });
});
