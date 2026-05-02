import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequest, mockCallLLM } = vi.hoisted(() => ({
  mockRequest: vi.fn(),
  mockCallLLM: vi.fn(),
}));
vi.mock("undici", () => ({ request: mockRequest }));
vi.mock("../../src/agents/llm.js", () => ({ callLLM: mockCallLLM }));

import { _extractAnchorsForTests, pickTeamUrls } from "../../src/ingest/teamPicker.js";

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
    const anchors = await _extractAnchorsForTests("https://example.com");
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
