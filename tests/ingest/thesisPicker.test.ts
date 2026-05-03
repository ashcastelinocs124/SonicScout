import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequest, mockCallLLM } = vi.hoisted(() => ({
  mockRequest: vi.fn(),
  mockCallLLM: vi.fn(),
}));
vi.mock("undici", () => ({ request: mockRequest }));
vi.mock("../../src/agents/llm.js", () => ({ callLLM: mockCallLLM }));

import { pickThesisUrls } from "../../src/ingest/thesisPicker.js";

describe("pickThesisUrls", () => {
  beforeEach(() => {
    mockRequest.mockReset();
    mockCallLLM.mockReset();
  });

  it("returns LLM-picked thesis-relevant URLs from the candidate list", async () => {
    mockRequest.mockResolvedValueOnce({
      body: { text: async () => `
        <html><body>
          <a href="/thesis">Our Thesis</a>
          <a href="/portfolio">Portfolio</a>
          <a href="/careers">Careers</a>
          <a href="/about">About</a>
        </body></html>
      ` },
    });
    mockCallLLM.mockResolvedValueOnce(JSON.stringify({
      urls: ["https://examplevc.com/thesis", "https://examplevc.com/about"],
    }));
    const urls = await pickThesisUrls("https://examplevc.com");
    expect(urls).toEqual([
      "https://examplevc.com/thesis",
      "https://examplevc.com/about",
    ]);
    const args = mockCallLLM.mock.calls[0]![0];
    expect(args.model).toBe("gpt-5-mini");
    expect(args.user).toContain("Our Thesis");
    expect(args.system).toContain("thesis");
  });

  it("filters hallucinated URLs not in candidate list", async () => {
    mockRequest.mockResolvedValueOnce({
      body: { text: async () => `<a href="/about">About</a>` },
    });
    mockCallLLM.mockResolvedValueOnce(JSON.stringify({
      urls: ["https://examplevc.com/about", "https://examplevc.com/thesis"],
    }));
    const urls = await pickThesisUrls("https://examplevc.com");
    expect(urls).toEqual(["https://examplevc.com/about"]);
  });

  it("returns [] when LLM returns invalid JSON", async () => {
    mockRequest.mockResolvedValueOnce({
      body: { text: async () => `<a href="/about">About</a>` },
    });
    mockCallLLM.mockResolvedValueOnce("not json");
    const urls = await pickThesisUrls("https://examplevc.com");
    expect(urls).toEqual([]);
  });

  it("returns [] when homepage fetch throws", async () => {
    mockRequest.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const urls = await pickThesisUrls("https://examplevc.com");
    expect(urls).toEqual([]);
    expect(mockCallLLM).not.toHaveBeenCalled();
  });
});
