import FirecrawlApp from "@mendable/firecrawl-js";

let cached: FirecrawlApp | null | undefined;

export function getFirecrawl(): FirecrawlApp | null {
  if (cached !== undefined) return cached;
  const apiKey = process.env.FIRECRAWL_API_KEY;
  cached = apiKey ? new FirecrawlApp({ apiKey }) : null;
  return cached;
}

export function _resetFirecrawlForTests(): void {
  cached = undefined;
}
