import { describe, it, expect } from "vitest";
import path from "node:path";
import { ingest } from "../../src/agents/ingestion.js";

describe("ingestion", () => {
  it("extracts text from a local PDF and HTML file", async () => {
    const ctx = await ingest({
      deckPath: path.resolve("tests/fixtures/synapse-deck.pdf"),
      websitePath: path.resolve("tests/fixtures/synapse-site.html"),
    });
    expect(ctx.deckText && ctx.deckText.length).toBeGreaterThan(0);
    expect(ctx.deckText).toContain("Synapse Protocol");
    expect(ctx.websiteText).toContain("Synapse Protocol");
  });

  it("returns undefined for missing inputs", async () => {
    const ctx = await ingest({});
    expect(ctx.deckText).toBeUndefined();
    expect(ctx.websiteText).toBeUndefined();
    expect(ctx.founderProfiles).toEqual([]);
  });
});
