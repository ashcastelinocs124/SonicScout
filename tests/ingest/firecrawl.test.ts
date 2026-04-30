import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getFirecrawl, _resetFirecrawlForTests } from "../../src/ingest/firecrawl.js";

describe("getFirecrawl", () => {
  const original = process.env.FIRECRAWL_API_KEY;
  beforeEach(() => {
    delete process.env.FIRECRAWL_API_KEY;
    _resetFirecrawlForTests();
  });
  afterEach(() => {
    process.env.FIRECRAWL_API_KEY = original;
  });

  it("returns null when FIRECRAWL_API_KEY is unset", () => {
    expect(getFirecrawl()).toBeNull();
  });

  it("returns a client when FIRECRAWL_API_KEY is set", () => {
    process.env.FIRECRAWL_API_KEY = "fc-test-key";
    const client = getFirecrawl();
    expect(client).not.toBeNull();
  });

  it("memoizes across calls", () => {
    process.env.FIRECRAWL_API_KEY = "fc-test-key";
    const a = getFirecrawl();
    const b = getFirecrawl();
    expect(a).toBe(b);
  });
});
