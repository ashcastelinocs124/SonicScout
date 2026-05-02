import { describe, it, expect, vi } from "vitest";

const { mockRequest } = vi.hoisted(() => ({ mockRequest: vi.fn() }));
vi.mock("undici", () => ({ request: mockRequest }));

import { _extractAnchorsForTests } from "../../src/ingest/teamPicker.js";

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
