import { describe, it, expect, vi, beforeEach } from "vitest";
import { _resetFirecrawlForTests } from "../../src/ingest/firecrawl.js";

const mockExtract = vi.fn();
const mockScrape = vi.fn();

vi.mock("@mendable/firecrawl-js", () => {
  // Use a real (non-arrow) function so `new FirecrawlApp(...)` works.
  function FirecrawlMock() {
    return { extract: mockExtract, scrape: mockScrape };
  }
  return { default: FirecrawlMock };
});

import { discoverFounders, scrapeProfile } from "../../src/ingest/founders.js";

describe("discoverFounders", () => {
  beforeEach(() => {
    _resetFirecrawlForTests();
    mockExtract.mockReset();
    mockScrape.mockReset();
    process.env.FIRECRAWL_API_KEY = "fc-test";
  });

  it("returns extracted founders with linkedin URLs", async () => {
    mockExtract.mockResolvedValueOnce({
      success: true,
      data: {
        companyName: "Harvey",
        founders: [
          { name: "Winston Weinberg", title: "CEO", linkedinUrl: "https://www.linkedin.com/in/winston-weinberg/" },
          { name: "Gabriel Pereyra", title: "President" },
        ],
      },
    });
    const result = await discoverFounders("https://harvey.ai");
    expect(result).toHaveLength(2);
    expect(result[0]!.linkedinUrl).toContain("winston-weinberg");
    expect(result[1]!.linkedinUrl).toBeUndefined();
  });

  it("returns [] when FIRECRAWL_API_KEY is unset", async () => {
    delete process.env.FIRECRAWL_API_KEY;
    _resetFirecrawlForTests();
    const result = await discoverFounders("https://harvey.ai");
    expect(result).toEqual([]);
    expect(mockExtract).not.toHaveBeenCalled();
  });

  it("returns [] when extract throws", async () => {
    mockExtract.mockRejectedValueOnce(new Error("rate limited"));
    const result = await discoverFounders("https://harvey.ai");
    expect(result).toEqual([]);
  });

  it("returns [] when extract returns success: false", async () => {
    mockExtract.mockResolvedValueOnce({ success: false, error: "boom" });
    const result = await discoverFounders("https://harvey.ai");
    expect(result).toEqual([]);
  });
});

describe("scrapeProfile", () => {
  beforeEach(() => {
    _resetFirecrawlForTests();
    mockExtract.mockReset();
    mockScrape.mockReset();
    process.env.FIRECRAWL_API_KEY = "fc-test";
  });

  it("returns markdown text when scrape succeeds", async () => {
    // v2 SDK: scrape() resolves to a Document directly (markdown at top level),
    // not to a { success, data: { markdown } } envelope.
    mockScrape.mockResolvedValueOnce({
      markdown: "## Experience\nCEO at Harvey 2022-present",
    });
    const result = await scrapeProfile("https://www.linkedin.com/in/winston-weinberg/");
    expect(result.url).toContain("winston-weinberg");
    expect(result.text).toContain("CEO at Harvey");
  });

  it("returns empty text when FIRECRAWL_API_KEY is unset", async () => {
    delete process.env.FIRECRAWL_API_KEY;
    _resetFirecrawlForTests();
    const result = await scrapeProfile("https://www.linkedin.com/in/x/");
    expect(result.text).toBe("");
    expect(mockScrape).not.toHaveBeenCalled();
  });

  it("returns empty text when scrape throws", async () => {
    mockScrape.mockRejectedValueOnce(new Error("network"));
    const result = await scrapeProfile("https://www.linkedin.com/in/x/");
    expect(result.text).toBe("");
  });

  it("truncates very long markdown to 8000 chars", async () => {
    mockScrape.mockResolvedValueOnce({ markdown: "a".repeat(20000) });
    const result = await scrapeProfile("https://www.linkedin.com/in/x/");
    expect(result.text.length).toBe(8000);
  });
});
