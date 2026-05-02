import { describe, it, expect, vi, beforeEach } from "vitest";
import path from "node:path";

const { mockDiscoverCompetitors } = vi.hoisted(() => ({
  mockDiscoverCompetitors: vi.fn(async () => []),
}));
vi.mock("../../src/ingest/competitors.js", () => ({
  discoverCompetitors: mockDiscoverCompetitors,
}));

const { ingest } = await import("../../src/agents/ingestion.js");

describe("ingestion", () => {
  beforeEach(() => {
    mockDiscoverCompetitors.mockReset();
    mockDiscoverCompetitors.mockResolvedValue([]);
  });

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
    expect(ctx.competitors).toEqual([]);
  });

  it("populates competitors when websiteText is present", async () => {
    mockDiscoverCompetitors.mockResolvedValueOnce([
      { name: "Rival Co", positioning: "competing offering", source: "https://example.com/rival" },
    ]);
    const ctx = await ingest({
      websitePath: path.resolve("tests/fixtures/synapse-site.html"),
    });
    expect(ctx.competitors).toHaveLength(1);
    expect(ctx.competitors[0]!.name).toBe("Rival Co");
    expect(mockDiscoverCompetitors).toHaveBeenCalledTimes(1);
    const [companyUrl, websiteText] = mockDiscoverCompetitors.mock.calls[0]!;
    expect(companyUrl).toContain("synapse-site.html");
    expect(websiteText).toContain("Synapse Protocol");
  });
});
