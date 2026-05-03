import { describe, it, expect, vi, beforeEach } from "vitest";
import { _resetFirecrawlForTests } from "../../src/ingest/firecrawl.js";

const { mockPickThesisUrls, mockCallLLM, mockScrape, mockRequest } = vi.hoisted(() => ({
  mockPickThesisUrls: vi.fn(),
  mockCallLLM: vi.fn(),
  mockScrape: vi.fn(),
  mockRequest: vi.fn(),
}));
vi.mock("../../src/ingest/thesisPicker.js", () => ({ pickThesisUrls: mockPickThesisUrls }));
vi.mock("../../src/agents/llm.js", () => ({ callLLM: mockCallLLM }));
vi.mock("undici", () => ({ request: mockRequest }));
vi.mock("@mendable/firecrawl-js", () => {
  function FirecrawlMock() { return { scrape: mockScrape }; }
  return { default: FirecrawlMock };
});

import { generateThesis } from "../../src/agents/thesisGenerator.js";

describe("generateThesis", () => {
  beforeEach(() => {
    mockPickThesisUrls.mockReset();
    mockCallLLM.mockReset();
    mockScrape.mockReset();
    mockRequest.mockReset();
    _resetFirecrawlForTests();
    process.env.FIRECRAWL_API_KEY = "fc-test";
  });

  it("returns four-section DraftThesis from picker + scrape + LLM", async () => {
    mockRequest.mockResolvedValueOnce({
      body: { text: async () => "<html><body>Decasonic invests in agentic apps.</body></html>" },
    });
    mockPickThesisUrls.mockResolvedValueOnce(["https://decasonic.com/thesis"]);
    mockScrape.mockResolvedValueOnce({ markdown: "# Thesis\nWe back agentic apps." });
    mockCallLLM.mockResolvedValueOnce(JSON.stringify({
      marketBeliefs: "- Agentic apps win 2026-2028",
      founderFilters: "- Technical founders shipping in public",
      tokenStance: "- Token only when off-chain coordination fails",
      antiPatterns: "- AI + blockchain with no on-chain interaction",
    }));
    const out = await generateThesis("https://decasonic.com");
    expect(out.marketBeliefs).toContain("Agentic apps");
    expect(out.founderFilters).toContain("Technical founders");
    expect(out.tokenStance).toContain("Token only");
    expect(out.antiPatterns).toContain("AI + blockchain");
    expect(mockPickThesisUrls).toHaveBeenCalledWith("https://decasonic.com");
    expect(mockScrape).toHaveBeenCalledTimes(1);
    const llmArgs = mockCallLLM.mock.calls[0]![0];
    expect(llmArgs.model).toBe("gpt-5");
    expect(llmArgs.user).toContain("Decasonic invests");
    expect(llmArgs.user).toContain("We back agentic apps");
  });

  it("falls through to homepage-only when picker returns []", async () => {
    mockRequest.mockResolvedValueOnce({
      body: { text: async () => "<html><body>Homepage text only.</body></html>" },
    });
    mockPickThesisUrls.mockResolvedValueOnce([]);
    mockCallLLM.mockResolvedValueOnce(JSON.stringify({
      marketBeliefs: "- a", founderFilters: "- b", tokenStance: "- c", antiPatterns: "- d",
    }));
    const out = await generateThesis("https://example.com");
    expect(mockScrape).not.toHaveBeenCalled();
    expect(out.marketBeliefs).toBe("- a");
  });

  it("skips Firecrawl when key is unset", async () => {
    delete process.env.FIRECRAWL_API_KEY;
    _resetFirecrawlForTests();
    mockRequest.mockResolvedValueOnce({
      body: { text: async () => "<html><body>Homepage.</body></html>" },
    });
    mockPickThesisUrls.mockResolvedValueOnce(["https://example.com/thesis"]);
    mockCallLLM.mockResolvedValueOnce(JSON.stringify({
      marketBeliefs: "- a", founderFilters: "- b", tokenStance: "- c", antiPatterns: "- d",
    }));
    const out = await generateThesis("https://example.com");
    expect(mockScrape).not.toHaveBeenCalled();
    expect(out.marketBeliefs).toBe("- a");
  });

  it("returns empty DraftThesis when LLM returns invalid JSON", async () => {
    mockRequest.mockResolvedValueOnce({
      body: { text: async () => "<html><body>Some text.</body></html>" },
    });
    mockPickThesisUrls.mockResolvedValueOnce([]);
    mockCallLLM.mockResolvedValueOnce("sorry, I can't help with that");
    const out = await generateThesis("https://example.com");
    expect(out).toEqual({ marketBeliefs: "", founderFilters: "", tokenStance: "", antiPatterns: "" });
  });

  it("returns empty DraftThesis when LLM throws", async () => {
    mockRequest.mockResolvedValueOnce({
      body: { text: async () => "<html><body>Some text.</body></html>" },
    });
    mockPickThesisUrls.mockResolvedValueOnce([]);
    mockCallLLM.mockRejectedValueOnce(new Error("api down"));
    const out = await generateThesis("https://example.com");
    expect(out).toEqual({ marketBeliefs: "", founderFilters: "", tokenStance: "", antiPatterns: "" });
  });

  it("returns empty DraftThesis when nothing was scraped (homepage fail + no Firecrawl)", async () => {
    delete process.env.FIRECRAWL_API_KEY;
    _resetFirecrawlForTests();
    mockRequest.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    mockPickThesisUrls.mockResolvedValueOnce([]);
    const out = await generateThesis("https://example.com");
    expect(out).toEqual({ marketBeliefs: "", founderFilters: "", tokenStance: "", antiPatterns: "" });
    expect(mockCallLLM).not.toHaveBeenCalled();
  });
});
