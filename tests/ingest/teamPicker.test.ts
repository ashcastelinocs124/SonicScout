import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequest, mockCallLLM, mockMap } = vi.hoisted(() => ({
  mockRequest: vi.fn(),
  mockCallLLM: vi.fn(),
  mockMap: vi.fn(),
}));
vi.mock("undici", () => ({ request: mockRequest }));
vi.mock("../../src/agents/llm.js", () => ({ callLLM: mockCallLLM }));
vi.mock("@mendable/firecrawl-js", () => {
  function FirecrawlMock() {
    return { map: mockMap };
  }
  return { default: FirecrawlMock };
});

import { extractAnchors, pickTeamUrls } from "../../src/ingest/teamPicker.js";
import { _resetFirecrawlForTests } from "../../src/ingest/firecrawl.js";

describe("anchor extraction", () => {
  it("returns deduped same-origin {label,url} pairs", async () => {
    mockRequest.mockResolvedValueOnce({
      body: { text: async () => `
        <html><body>
          <a href="/team">Our Team</a>
          <a href="/team">Team</a>
          <a href="https://example.com/about">About</a>
          <a href="https://other.com/team">External</a>
          <a href="mailto:hi@example.com">Email</a>
          <a href="#top">Top</a>
          <a href="/whitepaper.pdf">Whitepaper</a>
        </body></html>
      ` },
    });
    const anchors = await extractAnchors("https://example.com");
    expect(anchors).toEqual([
      { label: "Our Team", url: "https://example.com/team" },
      { label: "About",    url: "https://example.com/about" },
    ]);
  });
});

describe("pickTeamUrls (path A)", () => {
  beforeEach(() => {
    mockRequest.mockReset();
    mockCallLLM.mockReset();
  });

  it("returns LLM-picked URLs that exist in the candidate list", async () => {
    mockRequest.mockResolvedValueOnce({
      body: { text: async () => `
        <html><body>
          <a href="/team">Our Team</a>
          <a href="/leadership">Leadership</a>
          <a href="/careers">Careers</a>
        </body></html>
      ` },
    });
    mockCallLLM.mockResolvedValueOnce(
      JSON.stringify({ urls: [
        "https://example.com/team",
        "https://example.com/leadership",
      ]})
    );
    const urls = await pickTeamUrls("https://example.com");
    expect(urls).toEqual([
      "https://example.com/team",
      "https://example.com/leadership",
    ]);
    expect(mockCallLLM).toHaveBeenCalledOnce();
    const args = mockCallLLM.mock.calls[0]![0];
    expect(args.model).toBe("gpt-5-mini");
    expect(args.user).toContain("Our Team");
    expect(args.user).toContain("/team");
  });

  it("filters out URLs the LLM invented that aren't in the candidate list", async () => {
    mockRequest.mockResolvedValueOnce({
      body: { text: async () => `<a href="/about">About</a>` },
    });
    mockCallLLM.mockResolvedValueOnce(
      JSON.stringify({ urls: [
        "https://example.com/about",
        "https://example.com/team", // not in candidate list — should be dropped
      ]})
    );
    const urls = await pickTeamUrls("https://example.com");
    expect(urls).toEqual(["https://example.com/about"]);
  });

  it("treats invalid JSON as empty pick", async () => {
    mockRequest.mockResolvedValueOnce({
      body: { text: async () => `<a href="/team">Team</a>` },
    });
    mockCallLLM.mockResolvedValueOnce("sorry I'm not sure");
    const urls = await pickTeamUrls("https://example.com");
    expect(urls).toEqual([]);
  });

  it("returns [] when homepage fetch throws", async () => {
    mockRequest.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const urls = await pickTeamUrls("https://example.com");
    expect(urls).toEqual([]);
    expect(mockCallLLM).not.toHaveBeenCalled();
  });
});

describe("pickTeamUrls (path B fallback)", () => {
  beforeEach(() => {
    mockRequest.mockReset();
    mockCallLLM.mockReset();
    mockMap.mockReset();
    _resetFirecrawlForTests();
    process.env.FIRECRAWL_API_KEY = "fc-test";
  });

  it("falls back to fc.map when path A returns empty", async () => {
    mockRequest.mockResolvedValueOnce({
      body: { text: async () => `<a href="/careers">Careers</a>` },
    });
    mockCallLLM.mockResolvedValueOnce(JSON.stringify({ urls: [] })); // A picks nothing
    mockMap.mockResolvedValueOnce({
      links: [
        { url: "https://example.com/careers" },
        { url: "https://example.com/our-people" },
        { url: "https://example.com/blog" },
      ],
    });
    mockCallLLM.mockResolvedValueOnce(
      JSON.stringify({ urls: ["https://example.com/our-people"] })
    );
    const urls = await pickTeamUrls("https://example.com");
    expect(urls).toEqual(["https://example.com/our-people"]);
    expect(mockMap).toHaveBeenCalledOnce();
    expect(mockCallLLM).toHaveBeenCalledTimes(2);
  });

  it("returns [] when both A and B come up empty", async () => {
    mockRequest.mockResolvedValueOnce({
      body: { text: async () => `<a href="/x">X</a>` },
    });
    mockCallLLM.mockResolvedValueOnce(JSON.stringify({ urls: [] }));
    mockMap.mockResolvedValueOnce({ links: [{ url: "https://example.com/blog" }] });
    mockCallLLM.mockResolvedValueOnce(JSON.stringify({ urls: [] }));
    const urls = await pickTeamUrls("https://example.com");
    expect(urls).toEqual([]);
  });

  it("skips path B when FIRECRAWL_API_KEY is unset", async () => {
    delete process.env.FIRECRAWL_API_KEY;
    _resetFirecrawlForTests();
    mockRequest.mockResolvedValueOnce({
      body: { text: async () => `<a href="/x">X</a>` },
    });
    mockCallLLM.mockResolvedValueOnce(JSON.stringify({ urls: [] }));
    const urls = await pickTeamUrls("https://example.com");
    expect(urls).toEqual([]);
    expect(mockMap).not.toHaveBeenCalled();
  });
});
