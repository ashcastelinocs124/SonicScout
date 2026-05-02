import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockCallLLMWithSearch } = vi.hoisted(() => ({
  mockCallLLMWithSearch: vi.fn(),
}));
vi.mock("../../src/agents/llm.js", () => ({ callLLMWithSearch: mockCallLLMWithSearch }));

import { discoverCompetitors } from "../../src/ingest/competitors.js";

describe("discoverCompetitors", () => {
  beforeEach(() => mockCallLLMWithSearch.mockReset());

  it("returns 3 competitors when sources match retrieved hosts", async () => {
    mockCallLLMWithSearch.mockResolvedValueOnce({
      text: JSON.stringify({
        competitors: [
          { name: "BCG X", url: "https://www.bcg.com/x", positioning: "Big-3 consultancy AI practice", source: "https://www.bcg.com/x/about" },
          { name: "Accenture Song", positioning: "CX consulting arm", source: "https://newsroom.accenture.com/news/2024/song" },
          { name: "R/GA", positioning: "Independent brand consultancy", source: "https://www.rga.com/services" },
        ],
      }),
      citationHosts: new Set(["www.bcg.com", "newsroom.accenture.com", "www.rga.com"]),
    });
    const out = await discoverCompetitors("https://forum3.com", "Forum3 is an agentic strategy advisor for consumer brands.");
    expect(out).toHaveLength(3);
    expect(out[0]!.name).toBe("BCG X");
    expect(out[2]!.url).toBeUndefined();
    const args = mockCallLLMWithSearch.mock.calls[0][0];
    expect(args.model).toBe("gpt-5-mini");
    expect(args.user).toContain("https://forum3.com");
    expect(args.user).toContain("agentic strategy advisor");
  });

  it("filters out competitors whose source host wasn't actually retrieved", async () => {
    mockCallLLMWithSearch.mockResolvedValueOnce({
      text: JSON.stringify({
        competitors: [
          { name: "BCG X", positioning: "real", source: "https://www.bcg.com/x/about" },
          { name: "Fake.io", positioning: "hallucinated", source: "https://fake.io/competes" },
        ],
      }),
      citationHosts: new Set(["www.bcg.com"]),
    });
    const out = await discoverCompetitors("https://forum3.com", "blurb");
    expect(out.map((c) => c.name)).toEqual(["BCG X"]);
  });

  it("drops competitors that cite the company's own site", async () => {
    mockCallLLMWithSearch.mockResolvedValueOnce({
      text: JSON.stringify({
        competitors: [
          { name: "Self-cited", positioning: "x", source: "https://forum3.com/about" },
        ],
      }),
      citationHosts: new Set(["forum3.com"]),
    });
    const out = await discoverCompetitors("https://forum3.com", "blurb");
    expect(out).toEqual([]);
  });

  it("returns [] on invalid JSON", async () => {
    mockCallLLMWithSearch.mockResolvedValueOnce({
      text: "I cannot help with that.", citationHosts: new Set(),
    });
    const out = await discoverCompetitors("https://forum3.com", "blurb");
    expect(out).toEqual([]);
  });

  it("returns [] when search call throws", async () => {
    mockCallLLMWithSearch.mockRejectedValueOnce(new Error("api down"));
    const out = await discoverCompetitors("https://forum3.com", "blurb");
    expect(out).toEqual([]);
  });

  it("returns [] without calling search when websiteText is empty", async () => {
    const out = await discoverCompetitors("https://forum3.com", "");
    expect(out).toEqual([]);
    expect(mockCallLLMWithSearch).not.toHaveBeenCalled();
  });

  it("caps at 3 even if model returns more", async () => {
    mockCallLLMWithSearch.mockResolvedValueOnce({
      text: JSON.stringify({
        competitors: Array.from({ length: 5 }, (_, i) => ({
          name: `C${i}`, positioning: "x", source: `https://example.com/${i}`,
        })),
      }),
      citationHosts: new Set(["example.com"]),
    });
    const out = await discoverCompetitors("https://forum3.com", "blurb");
    expect(out).toHaveLength(3);
  });
});
